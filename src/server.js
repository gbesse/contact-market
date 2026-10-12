import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { project } from './project.js';
import { commonsConfig } from './commons.js';
import { readCommonsEvidence, runCommons, saveCommons } from './commons-engine.js';
import { renderCommons, renderCommonsMethod } from './page.js';
import { messageTranslations } from './i18n.js';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
export async function createDemoServer({
  port = 0,
  storageDir = resolve(root, '.local/reports'),
  runtime,
} = {}) {
  await mkdir(storageDir, { recursive: true, mode: 0o700 });
  const token = randomBytes(24).toString('hex');
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(value));
    };
    let locale = 'fr';
    try {
      const livePort = server.address().port,
        origin = `http://127.0.0.1:${livePort}`;
      if (![`127.0.0.1:${livePort}`, `localhost:${livePort}`].includes(req.headers.host))
        return send(403, { code: 'HOST' });
      const url = new URL(req.url, origin),
        path = url.pathname;
      locale = ['fr', 'en', 'es'].includes(url.searchParams.get('lang'))
        ? url.searchParams.get('lang')
        : 'fr';
      if (req.method === 'GET') {
        if (path === '/health') return send(200, { ok: true, project: project.slug });
        if (path === '/api/session') return send(200, { token });
        if (path === '/api/replay') {
          if (url.searchParams.has('kind') && url.searchParams.get('kind') !== project.kind)
            return send(400, { code: 'COMMONS_CONFIG' });
          const values = Object.fromEntries(
            [...url.searchParams]
              .filter(([k]) => !['kind', 'lang'].includes(k))
              .map(([k, v]) => [k, ['profile', 'outage'].includes(k) ? v : Number(v)]),
          );
          const config = commonsConfig(project.kind, values);
          let report;
          try {
            report = await readCommonsEvidence(project.kind, config, storageDir);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            report = await readCommonsEvidence(
              project.kind,
              config,
              resolve(root, 'fixtures/commons'),
            );
          }
          return send(200, report);
        }
        if (
          path === '/' ||
          path === `/space/commons/${project.kind}` ||
          path === `/space/commons/${project.kind}/` ||
          path === '/space-method'
        ) {
          if (path === '/') {
            res.writeHead(302, { Location: `/space/commons/${project.kind}?${url.searchParams}` });
            return res.end();
          }
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy':
              "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
          });
          return res.end(
            path === '/space-method'
              ? renderCommonsMethod(locale)
              : renderCommons(project.kind, locale),
          );
        }
        const files = {
          '/style.css': 'public/style.css',
          '/space.css': 'public/space.css',
          '/space-commons.css': 'public/space-commons.css',
          '/space-commons.js': 'public/app.js',
          '/space-lib/commons.js': 'src/commons.js',
          '/i18n.js': 'src/i18n.js',
        };
        if (files[path]) {
          res.writeHead(200, {
            'Content-Type': path.endsWith('.css') ? 'text/css' : 'text/javascript',
            'X-Content-Type-Options': 'nosniff',
          });
          return res.end(await readFile(resolve(root, files[path]), 'utf8'));
        }
        return send(404, { code: 'NOT_FOUND' });
      }
      if (req.method !== 'POST' || path !== '/api/run') return send(405, { code: 'METHOD' });
      if (
        req.headers['x-project-token'] !== token ||
        (req.headers.origin &&
          ![origin, `http://localhost:${livePort}`].includes(req.headers.origin))
      )
        return send(403, { code: 'AUTH' });
      let text = '';
      for await (const chunk of req) {
        text += chunk;
        if (Buffer.byteLength(text) > 8192) return send(413, { code: 'LIMIT' });
      }
      let input;
      try {
        input = JSON.parse(text || '{}');
      } catch {
        throw Error('COMMONS_CONFIG');
      }
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        (input.kind && input.kind !== project.kind)
      )
        throw Error('COMMONS_CONFIG');
      locale = ['fr', 'en', 'es'].includes(input.locale) ? input.locale : locale;
      const report = await runCommons(project.kind, input.config, {
        ...(runtime ? { runtime } : {}),
      });
      await saveCommons(report, storageDir);
      return send(200, report);
    } catch (error) {
      const code = error.message,
        key =
          code === 'COMMONS_BUSY'
            ? 'commonsBusy'
            : code === 'COMMONS_CONFIG'
              ? 'commonsInvalid'
              : error.code === 'ENOENT'
                ? 'commonsMissing'
                : 'commonsUnavailable';
      send(
        key === 'commonsBusy'
          ? 409
          : key === 'commonsInvalid'
            ? 400
            : key === 'commonsMissing'
              ? 404
              : 503,
        { code, message: messageTranslations[key][{ fr: 0, en: 1, es: 2 }[locale]] },
      );
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', done);
  });
  return {
    server,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    },
  };
}
