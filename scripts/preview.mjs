import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
export async function staticPreview(directory = resolve('output/site'), port = 0) {
  const root = resolve(directory);
  const server = http.createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let target = resolve(root, '.' + path);
      if (target !== root && !target.startsWith(root + sep)) throw new Error('PATH');
      if ((await stat(target)).isDirectory()) target = resolve(target, 'index.html');
      const types = {
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.html': 'text/html',
        '.xml': 'application/xml',
        '.txt': 'text/plain',
      };
      res.writeHead(200, {
        'Content-Type': types[extname(target)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(await readFile(target));
    } catch {
      res.writeHead(404);
      res.end('404');
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}
