import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { project } from '../src/project.js';
import { commonsConfig, dailyCommons } from '../src/commons.js';
import { readCommonsEvidence, runCommons } from '../src/commons-engine.js';
import { messageTranslations } from '../src/i18n.js';
const args = process.argv.slice(2),
  command = args.shift() || 'demo';
let locale = 'fr';
try {
  const config = {},
    options = {};
  for (const arg of args) {
    const match = /^--([A-Za-z]\w*)=(.+)$/.exec(arg);
    if (!match) throw Error('COMMONS_CONFIG');
    const [, key, value] = match;
    if (['locale', 'output', 'day'].includes(key)) options[key] = value;
    else config[key] = ['profile', 'outage'].includes(key) ? value : Number(value);
  }
  if (options.locale) {
    if (!['fr', 'en', 'es'].includes(options.locale)) throw Error('COMMONS_CONFIG');
    locale = options.locale;
  }
  if (!['demo', 'replay', 'run', 'daily'].includes(command)) throw Error('COMMONS_CONFIG');
  const current =
    command === 'daily'
      ? dailyCommons(project.kind, options.day || new Date().toISOString().slice(0, 10))
      : commonsConfig(project.kind, config);
  const report =
    command === 'run'
      ? await runCommons(project.kind, current)
      : await readCommonsEvidence(
          project.kind,
          current,
          fileURLToPath(new URL('../fixtures/commons/', import.meta.url)),
        );
  const output =
    JSON.stringify({ ...report, locale, notice: report.notices[locale] }, null, 2) + '\n';
  if (options.output) await writeFile(resolve(options.output), output, { flag: 'wx', mode: 0o600 });
  else process.stdout.write(output);
} catch (error) {
  const key =
    error.code === 'EEXIST'
      ? 'standaloneOutputExists'
      : error.code === 'ENOENT'
        ? 'commonsMissing'
        : error.message === 'COMMONS_CONFIG'
          ? 'commonsInvalid'
          : 'commonsUnavailable';
  console.error(messageTranslations[key][{ fr: 0, en: 1, es: 2 }[locale]]);
  process.exitCode = 2;
}
