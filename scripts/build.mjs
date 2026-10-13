import { mkdir, writeFile, readFile, readdir, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { project } from '../src/project.js';
import { renderCommons, renderCommonsMethod } from '../src/page.js';
import { readCommonsEvidence } from '../src/commons-engine.js';
import { normalizeBasePath, mountHTML } from './site-base.mjs';
const basePath = normalizeBasePath(process.env.SITE_BASE_PATH);
const directory = resolve('output/site');
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
async function save(path, text) {
  const file = resolve(directory, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, path.endsWith('.html') ? mountHTML(text, basePath) : text);
}
for (const [source, target] of [
  ['public/style.css', 'style.css'],
  ['public/space.css', 'space.css'],
  ['public/space-commons.css', 'space-commons.css'],
  ['public/app.js', 'space-commons.js'],
  ['src/commons.js', 'space-lib/commons.js'],
  ['src/i18n.js', 'i18n.js'],
])
  await save(target, await readFile(source));
const reports = [];
for (const name of await readdir('fixtures/commons')) {
  const data = JSON.parse(await readFile(resolve('fixtures/commons', name), 'utf8'));
  const report = await readCommonsEvidence(project.kind, data.config, resolve('fixtures/commons'));
  await save('space-evidence/' + name, JSON.stringify(report));
  reports.push({ id: report.id, config: report.config, evidenceSha256: report.evidenceSha256 });
}
for (const locale of ['fr', 'en', 'es']) {
  const path = `/space/commons/${project.kind}`;
  const html = renderCommons(project.kind, locale, { publicMode: true })
    .replace(/href="(\/space(?:[/?]|-method)[^"]*)"/g, (_, p) => `href="/${locale}${p}"`)
    .replace(
      /href="\/(fr|en|es)(\/space\/commons\/[^?"]+)\?lang=(fr|en|es)" lang/g,
      (_, current, p, target) => `href="/${target}${p}?lang=${target}" lang`,
    );
  await save(locale + path + '/index.html', html);
  const method = renderCommonsMethod(locale)
    .replace(/href="\?lang=(fr|en|es)"/g, (_, lang) => `href="/${lang}/space-method/?lang=${lang}"`)
    .replace(/href="(\/space(?:[/?]|-method)[^"]*)"/g, (_, p) => `href="/${locale}${p}"`);
  await save(`${locale}/space-method/index.html`, method);
  if (locale === 'fr') {
    await save('index.html', html);
    await save(path.slice(1) + '/index.html', html);
    await save('space-method/index.html', method);
  }
}
await save(
  'manifest.json',
  JSON.stringify(
    {
      project: project.slug,
      version: project.version,
      kind: project.kind,
      languages: ['fr', 'en', 'es'],
      basePath,
      reports,
      localAPIsPublished: false,
    },
    null,
    2,
  ),
);
await save('.nojekyll', '');
await copyFile('LICENSE', resolve(directory, 'LICENSE'));
console.log(
  `FR : site statique créé. EN: static site built. ES: sitio estático creado. ${directory}`,
);
