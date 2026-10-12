import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { project, replay } from '../src/index.js';
import { commonsConfig, commonsLink, readCommons, dailyCommons } from '../src/commons.js';
import {
  readCommonsEvidence,
  runCommons,
  commonsConfigId,
  verifyMarketReceipt,
} from '../src/commons-engine.js';
import { messageTranslations } from '../src/i18n.js';
import { createDemoServer } from '../src/server.js';
const execute = promisify(execFile);
test('recorded computations verify and preserve scientific provenance', async () => {
  const first = await replay();
  assert.equal(first.execution, 'replay');
  assert.equal(first.kind, project.kind);
  assert.ok(first.result.engines.length >= 2);
  assert.ok(first.result.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256)));
  for (const file of await readdir('fixtures/commons')) {
    const report = JSON.parse(await readFile('fixtures/commons/' + file, 'utf8'));
    await readCommonsEvidence(project.kind, report.config, resolve('fixtures/commons'));
  }
  if (project.kind === 'market') assert.equal(verifyMarketReceipt(first.result.receipt), true);
  const cases = new Map();
  for (let i = 1; i <= 365; i++) {
    const date = new Date(Date.UTC(2027, 0, i)).toISOString().slice(0, 10),
      config = dailyCommons(project.kind, date);
    cases.set(commonsConfigId(project.kind, config), config);
  }
  for (const config of cases.values()) await replay(config);
});
test('evidence tampering is rejected and missing engines never become a fake result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'space-proof-'));
  try {
    const report = await replay();
    report.result.engines[0].version = 'tampered';
    await writeFile(join(directory, report.id + '.json'), JSON.stringify(report));
    await assert.rejects(readCommonsEvidence(project.kind, report.config, directory), /INTEGRITY/);
    await assert.rejects(
      runCommons(project.kind, {}, { runtime: join(directory, 'missing') }),
      /UNAVAILABLE/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('three languages, parameter bounds and replayable challenge links', () => {
  for (const [key, row] of Object.entries(messageTranslations)) {
    assert.equal(row.length, 3, key);
    const placeholders = (text) => (text.match(/\{\w+\}/g) || []).sort();
    for (const value of row) {
      assert.ok(value.trim(), key);
      assert.deepEqual(placeholders(value), placeholders(row[0]), key);
    }
  }
  for (const locale of ['fr', 'en', 'es']) {
    const config = dailyCommons(project.kind, '2026-10-12'),
      url = commonsLink('https://example.org', project.kind, config, locale);
    assert.deepEqual(readCommons(url).config, config);
    assert.equal(readCommons(url).locale, locale);
  }
  assert.throws(() => commonsConfig(project.kind, { unknown: 1 }), /CONFIG/);
  assert.throws(() => commonsConfig('unrelated'), /CONFIG/);
});
test('CLI works after clone in FR EN ES and refuses to overwrite an export', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'space-cli-'));
  try {
    for (const locale of ['fr', 'en', 'es']) {
      const { stdout } = await execute(process.execPath, [
        'bin/cli.js',
        'demo',
        `--locale=${locale}`,
      ]);
      assert.equal(JSON.parse(stdout).locale, locale);
    }
    const output = join(directory, 'report.json');
    await execute(process.execPath, ['bin/cli.js', 'demo', '--output=' + output]);
    await assert.rejects(execute(process.execPath, ['bin/cli.js', 'demo', '--output=' + output]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test('local HTTP server rejects untrusted writes and invalid configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'space-http-')),
    demo = await createDemoServer({ storageDir: directory, runtime: join(directory, 'missing') });
  try {
    assert.equal(
      (await fetch(demo.origin + '/api/run', { method: 'POST', body: '{}' })).status,
      403,
    );
    const { token } = await (await fetch(demo.origin + '/api/session')).json();
    const headers = { 'Content-Type': 'application/json', 'x-project-token': token };
    assert.equal(
      (
        await fetch(demo.origin + '/api/run', {
          method: 'POST',
          headers,
          body: JSON.stringify({ config: { unknown: 1 } }),
        })
      ).status,
      400,
    );
    const unavailable = await fetch(demo.origin + '/api/run', {
      method: 'POST',
      headers,
      body: JSON.stringify({ locale: 'es' }),
    });
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).message, messageTranslations.commonsUnavailable[2]);
    assert.equal((await fetch(demo.origin + '/api/state')).status, 404);
  } finally {
    await demo.close();
    await rm(directory, { recursive: true, force: true });
  }
});
