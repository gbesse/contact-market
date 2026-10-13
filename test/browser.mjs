import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createDemoServer } from '../src/server.js';
import { project } from '../src/project.js';
import { messageTranslations } from '../src/i18n.js';
import { staticPreview } from '../scripts/preview.mjs';
const storageDir = await mkdtemp(join(tmpdir(), 'space-browser-')),
  demo = await createDemoServer({ storageDir }),
  browser = await chromium.launch({ headless: true }),
  output = resolve('output/browser');
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [index, locale] of ['fr', 'en', 'es'].entries()) {
    await page.goto(demo.origin + '/?lang=' + locale);
    assert.equal(await page.locator('h1').textContent(), project.name);
    assert.equal(
      await page.locator('#commons-status').textContent(),
      messageTranslations.commonsStartChallenge[index],
    );
    assert.equal(await page.locator('#commons-export').isDisabled(), true);
    await page.locator('#commons-replay').click();
    await page.locator('#commons-export:not([disabled])').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.ok(
      (await page.locator('#commons-status').textContent()).includes(
        messageTranslations.commonsCached[index],
      ),
    );
    assert.ok((await page.locator('#commons-chart svg').count()) > 0);
    await page.locator('#commons-check').click();
    assert.match(await page.locator('#commons-score').textContent(), /\/100/);
    const download = page.waitForEvent('download');
    await page.locator('#commons-export').click();
    const proof = await download;
    assert.equal(JSON.parse(await readFile(await proof.path(), 'utf8')).locale, locale);
    const card = page.waitForEvent('download');
    await page.locator('#commons-card').click();
    assert.match((await card).suggestedFilename(), /\.png$/);
    const link = await page.locator('#commons-link').inputValue();
    await page.goto(link);
    await page.locator('#commons-replay').click();
    await page.locator('#commons-export:not([disabled])').waitFor();
    await page.screenshot({
      path: resolve('docs', `${project.slug}-${locale}.png`),
      fullPage: true,
    });
    await page.locator('#commons-daily').click();
    await page.locator('#commons-replay').click();
    await page.locator('#commons-export:not([disabled])').waitFor();
    assert.ok(new URL(page.url()).searchParams.has('day'));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ['fr', 'en', 'es']) {
    await page.goto(demo.origin + '/?lang=' + locale);
    await page.locator('#commons-replay').click();
    await page.locator('#commons-export:not([disabled])').waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
  }
  const preview = await staticPreview(resolve('output/site'));
  try {
    for (const locale of ['fr', 'en', 'es']) {
      await page.goto(`${preview.origin}/${locale}/space/commons/${project.kind}/?lang=${locale}`);
      assert.equal(await page.locator('#commons-run').count(), 0);
      await page.locator('#commons-replay').click();
      await page.locator('#commons-export:not([disabled])').waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
    }
    assert.equal((await fetch(preview.origin + '/api/session')).status, 404);
  } finally {
    await preview.close();
  }
  const mount = '/' + project.slug;
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], {
    env: { ...process.env, SITE_BASE_PATH: mount },
  });
  const prefixed = await staticPreview(resolve('output/site'), 0, { basePath: mount });
  try {
    await page.goto(prefixed.origin + mount + '/');
    assert.equal(
      await page.locator('#commons-status').textContent(),
      messageTranslations.commonsStartChallenge[0],
    );
    const failures = [];
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().startsWith(prefixed.origin))
        failures.push(response.url());
    });
    for (const [index, locale] of ['fr', 'en', 'es'].entries()) {
      await page.goto(
        `${prefixed.origin}${mount}/${locale}/space/commons/${project.kind}/?lang=${locale}`,
      );
      await page.locator('#commons-replay').click();
      await page.locator('#commons-export:not([disabled])').waitFor();
      const shared = await page.locator('#commons-link').inputValue();
      assert.ok(new URL(shared).pathname.startsWith(`${mount}/${locale}/space/commons/`));
      await page.goto(shared);
      await page.locator('#commons-daily').click();
      await page.locator('#commons-replay').click();
      await page.locator('#commons-export:not([disabled])').waitFor();
      const currentConfig = await page.locator('#commons-link').inputValue();
      const next = ['en', 'es', 'fr'][index];
      await page.locator(`.commons-language[lang="${next}"]`).click();
      assert.equal(await page.locator('html').getAttribute('lang'), next);
      assert.equal(
        new URL(page.url()).searchParams.get('day'),
        new URL(currentConfig).searchParams.get('day'),
      );
      await page.locator('#commons-replay').click();
      await page.locator('#commons-export:not([disabled])').waitFor();
      const proofDownload = page.waitForEvent('download');
      await page.locator('#commons-export').click();
      assert.equal(
        JSON.parse(await readFile(await (await proofDownload).path(), 'utf8')).locale,
        next,
      );
      const pngDownload = page.waitForEvent('download');
      await page.locator('#commons-card').click();
      assert.match((await pngDownload).suggestedFilename(), /\.png$/);
      await page.locator(`a[href*="space-method"]`).click();
      assert.equal(await page.locator('html').getAttribute('lang'), next);
    }
    assert.deepEqual(failures, []);
    assert.equal((await fetch(prefixed.origin + '/i18n.js')).status, 404);
    assert.equal((await fetch(prefixed.origin + mount + '/api/session')).status, 404);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
  } finally {
    await prefixed.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    `FR : parcours FR/EN/ES vérifiés. EN: FR/EN/ES browser flows verified. ES: flujos FR/EN/ES verificados. ${project.slug}`,
  );
} finally {
  await browser.close();
  await demo.close();
  await rm(storageDir, { recursive: true, force: true });
}
