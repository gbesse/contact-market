import { verifyMarketSchedule } from './schedule-audit.js';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { commonsConfig, commonsVersion, commonsNotices } from './commons.js';
const engineDir = fileURLToPath(new URL('../engines/', import.meta.url));
export const defaultRuntime = process.env.SPACE_RUNTIME
  ? resolve(process.env.SPACE_RUNTIME)
  : fileURLToPath(new URL('../.local/space-runtime/', import.meta.url));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
export function commonsConfigId(kind, config) {
  return kind + '-' + digest(canonical(commonsConfig(kind, config))).slice(0, 16);
}
function python(runtime, worker, args, input, signal) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      resolve(runtime, 'venv/bin/python'),
      [resolve(engineDir, worker), runtime, ...args],
      {
        signal,
        env: { ...process.env, MPLBACKEND: 'Agg', MPLCONFIGDIR: resolve(runtime, 'mpl-cache') },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let output = '',
      stderr = '',
      settled = false;
    const timer = setTimeout(() => child.kill('SIGTERM'), 120000);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolveResult(value);
    };
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.length > 2500000) child.kill('SIGTERM');
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-8000);
    });
    child.on('error', (error) =>
      finish(Object.assign(new Error('COMMONS_ENGINE_UNAVAILABLE'), { cause: error })),
    );
    child.on('close', (code) => {
      if (code !== 0)
        return finish(Object.assign(new Error('COMMONS_ENGINE_FAILED'), { diagnostic: stderr }));
      try {
        finish(null, JSON.parse(output));
      } catch {
        finish(new Error('COMMONS_ENGINE_FAILED'));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const keys = generateKeyPairSync('ed25519');
export function verifyMarketReceipt(receipt) {
  try {
    return verify(
      null,
      Buffer.from(JSON.stringify(receipt.payload)),
      receipt.publicKey,
      Buffer.from(receipt.signature, 'base64'),
    );
  } catch {
    return false;
  }
}
let running = false;
export async function runCommons(
  kind,
  input = {},
  { runtime = defaultRuntime, ion = true, signal } = {},
) {
  const config = commonsConfig(kind, input);
  if (running) throw new Error('COMMONS_BUSY');
  running = true;
  try {
    const started = Date.now();
    const result = await python(runtime, 'worker.py', [kind], JSON.stringify(config), signal);
    if (kind === 'market' && ion) {
      const manifest = JSON.stringify({ schemaVersion: 1, config, awards: result.awards });
      result.transportProof = await python(runtime, 'ion_worker.py', [], manifest, signal);
      if (
        !result.transportProof.verified ||
        result.transportProof.receivedSha256 !== digest(manifest)
      )
        throw new Error('COMMONS_ENGINE_FAILED');
      const payload = {
        manifestSha256: digest(manifest),
        settledUnits: result.spentUnits,
        returnedUnits: result.remainingUnits,
        budgetUnits: config.budgetUnits,
        awardCount: result.awards.length,
        transport: 'localhost BPv7 UDP',
        credits: 'fictional',
      };
      result.receipt = {
        payload,
        publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
        signature: sign(null, Buffer.from(JSON.stringify(payload)), keys.privateKey).toString(
          'base64',
        ),
      };
      result.receiptVerified = verifyMarketReceipt(result.receipt);
      result.engines.push({ name: 'ION', version: '4.2.0' });
    }
    const scheduleAudit = kind === 'market' ? verifyMarketSchedule(result, config) : null;
    if (scheduleAudit && !scheduleAudit.valid) throw new Error('COMMONS_MARKET_INTEGRITY');
    const evidence = { kind, config, result };
    return {
      schemaVersion: 1,
      version: commonsVersion,
      id: commonsConfigId(kind, config),
      kind,
      config,
      executedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      evidenceSha256: digest(JSON.stringify(evidence)),
      execution: 'fresh',
      ...(scheduleAudit ? { scheduleAudit } : {}),
      notices: commonsNotices[kind],
      result,
    };
  } finally {
    running = false;
  }
}
export async function saveCommons(report, directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, report.id + '.json'), JSON.stringify(report, null, 2) + '\n');
}
export async function readCommonsEvidence(kind, config, directory) {
  const report = JSON.parse(
    await readFile(resolve(directory, commonsConfigId(kind, config) + '.json'), 'utf8'),
  );
  if (
    report.kind !== kind ||
    canonical(report.config) !== canonical(commonsConfig(kind, config)) ||
    report.version !== commonsVersion ||
    report.evidenceSha256 !==
      digest(JSON.stringify({ kind: report.kind, config: report.config, result: report.result }))
  )
    throw new Error('COMMONS_EVIDENCE_INTEGRITY');
  if (kind === 'market') {
    const receipt = report.result.receipt,
      proof = report.result.transportProof;
    const manifest = JSON.stringify({
      schemaVersion: 1,
      config: report.config,
      awards: report.result.awards,
    });
    if (
      !verifyMarketReceipt(receipt) ||
      !proof?.verified ||
      proof.sentSha256 !== digest(manifest) ||
      proof.receivedSha256 !== digest(manifest) ||
      receipt.payload.manifestSha256 !== digest(manifest) ||
      receipt.payload.settledUnits !== report.result.spentUnits ||
      receipt.payload.returnedUnits + receipt.payload.settledUnits !== report.config.budgetUnits
    )
      throw new Error('COMMONS_EVIDENCE_INTEGRITY');
  }
  const scheduleAudit =
    kind === 'market' ? verifyMarketSchedule(report.result, report.config) : null;
  if (scheduleAudit && !scheduleAudit.valid) throw new Error('COMMONS_MARKET_INTEGRITY');
  return { ...report, execution: 'replay', ...(scheduleAudit ? { scheduleAudit } : {}) };
}
