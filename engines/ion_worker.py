"""Owned two-node BPv7 UDP proof. No global IPC or process cleanup."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import time


def transfer(runtime, payload):
    runtime = Path(runtime).resolve()
    binary = runtime / 'ion/bin'
    if not (binary / 'ionadmin').exists(): raise RuntimeError('ION_UNAVAILABLE')
    with tempfile.TemporaryDirectory(prefix='ion-proof-', dir=runtime) as folder:
        folder = Path(folder)
        env = dict(os.environ, PATH=str(binary) + os.pathsep + os.environ.get('PATH', ''), ION_NODE_LIST_DIR=str(folder))
        ports = []
        for _ in range(2):
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.bind(('127.0.0.1', 0)); ports.append(sock.getsockname()[1])
        base = secrets.randbelow(10000000) + 1000000
        nodes = [base, base + 1]
        directories = []
        initialized = []
        receiver = None
        log = (folder / 'commands.log').open('w')
        def command(name, args, cwd, timeout=15):
            subprocess.run([str(binary / name), *args], cwd=cwd, env=env, stdout=log, stderr=log, timeout=timeout, check=True)
        try:
            for i, node in enumerate(nodes):
                directory = folder / str(node); directory.mkdir(); directories.append(directory)
                other = nodes[1-i]
                (directory/'node.ionconfig').write_text(f'wmKey {node}\nsdrName commons{node}\nsdrWmKey {node+10000000}\nsdrWmSize 200000\nheapKey {node+20000000}\nwmSize 200000\nconfigFlags 1\nheapWords 10000\npathName {directory}\n')
                (directory/'node.ionrc').write_text(f'1 {node} node.ionconfig\na contact +0 +90 {node} {other} 1000000\na range +0 +90 {node} {other} 0\ns\n')
                (directory/'node.bprc').write_text(f"1\na scheme ipn 'ipnfw' 'ipnadminep'\na endpoint ipn:{node}.0 q\na endpoint ipn:{node}.1 q\na protocol udp\na induct udp 127.0.0.1:{ports[i]} udpcli\na outduct udp 127.0.0.1:{ports[1-i]} udpclo\na plan ipn:{other}.0\na planduct ipn:{other}.0 udp 127.0.0.1:{ports[1-i]}\ns\n")
                command('ionadmin', ['node.ionrc'], directory)
                registry = (folder/'ion_nodes').read_text()
                if str(directory) not in registry: raise RuntimeError('ION_INITIALIZATION')
                initialized.append(directory)
                command('bpadmin', ['node.bprc'], directory)
            receiver = subprocess.Popen([str(binary/'bprecvfile'), f'ipn:{nodes[1]}.1', '1'], cwd=directories[1], env=env, stdout=log, stderr=log)
            time.sleep(.5)
            source = directories[0]/'manifest.json'; source.write_bytes(payload)
            command('bpsendfile', [f'ipn:{nodes[0]}.1', f'ipn:{nodes[1]}.1', 'manifest.json', '0.1', '60'], directories[0])
            receiver.wait(timeout=20)
            received = directories[1]/'testfile1'
            actual = received.read_bytes()
            if actual != payload: raise RuntimeError('ION_PAYLOAD_MISMATCH')
            digest = hashlib.sha256(payload).hexdigest()
            return {'engine':'ION', 'version':'4.2.0', 'protocol':'BPv7 / UDP', 'transport':'127.0.0.1', 'payloadKind':'schedule-manifest', 'bytes':len(payload), 'sentSha256':digest, 'receivedSha256':hashlib.sha256(actual).hexdigest(), 'verified':True, 'nodes':2}
        except Exception as error:
            log.flush()
            detail = (folder/'commands.log').read_text()[-3000:]
            for d in directories:
                if (d/'ion.log').exists(): detail += (d/'ion.log').read_text()[-3000:]
            print(detail, file=sys.stderr)
            raise error
        finally:
            if receiver and receiver.poll() is None: receiver.terminate(); receiver.wait(timeout=5)
            for directory in reversed(initialized):
                try: command('ionexit', ['n'], directory, timeout=25)
                except Exception: pass
            log.close()
            (runtime/"ion-last-diagnostic.log").write_text((folder/"commands.log").read_text())


def terminate(_signum, _frame):
    raise KeyboardInterrupt('ION_CANCELLED')


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, terminate)
    print(json.dumps(transfer(sys.argv[1], sys.stdin.buffer.read(500000))))
