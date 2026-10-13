import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBasePath, mountHTML } from '../scripts/site-base.mjs';
test('static deployment prefixes assets and links without changing external sources', () => {
  assert.equal(normalizeBasePath('/project/'), '/project');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(normalizeBasePath(undefined), '');
  for (const invalid of ['//host', '/a/../b', '/a%2fb', '/a?b', 'relative', '/a//b', '/a b'])
    assert.throws(() => normalizeBasePath(invalid));
  const html =
    '<body data-kind="market"><a href="/">home</a><a href="/es/space">es</a><script src="/app.js"></script><a href="https://source.org/data">source</a></body>';
  const output = mountHTML(html, '/demo/');
  assert.ok(output.includes('data-base-path="/demo"'));
  assert.ok(output.includes('href="/demo/"'));
  assert.ok(output.includes('href="/demo/es/space"'));
  assert.ok(output.includes('src="/demo/app.js"'));
  assert.ok(output.includes('href="https://source.org/data"'));
});
