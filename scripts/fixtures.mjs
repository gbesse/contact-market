import { readFile, readdir } from 'node:fs/promises';
import { project } from '../src/project.js';
import { runCommons, saveCommons } from '../src/commons-engine.js';
// Explicit refresh: published cases are recomputed by real engines.
for (const file of await readdir('fixtures/commons')) {
  const { config } = JSON.parse(await readFile('fixtures/commons/' + file, 'utf8'));
  const report = await runCommons(project.kind, config);
  await saveCommons(report, 'fixtures/commons');
  console.log(report.id + ' ' + report.evidenceSha256);
}
