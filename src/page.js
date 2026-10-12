import { commonsKinds, commonsDefaults, commonsNotices } from './commons.js';
import { messageTranslations } from './i18n.js';
export const commonsNames = {
  benchmark: 'Mission Benchmark Commons',
  market: 'Contact Market',
  citizen: 'Citizen Mission',
};
export const escapeCommons = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function renderCommons(
  kind = 'benchmark',
  locale = 'fr',
  { publicMode = false, summary } = {},
) {
  if (!commonsKinds.includes(kind)) throw new Error('COMMONS_CONFIG');
  const lang = ['fr', 'en', 'es'].includes(locale) ? locale : 'fr',
    index = { fr: 0, en: 1, es: 2 }[lang];
  const t = (key) => messageTranslations[key][index];
  const e = escapeCommons;
  const select = (key, label, values) =>
    `<label>${e(t(label))}<select id="${key}" name="${key}">${values.map(([v, text]) => `<option value="${v}" ${commonsDefaults[kind][key] === v ? 'selected' : ''}>${e(text)}</option>`).join('')}</select></label>`;
  const control =
    kind === 'benchmark'
      ? select('profile', 'commonsProfile', [
          ['iss', t('commonsIss')],
          ['moon', t('commonsMoon')],
        ]) +
        select(
          'stepSec',
          'commonsStep',
          [10, 30, 60, 120].map((v) => [v, String(v)]),
        )
      : kind === 'market'
        ? select(
            'budgetUnits',
            'commonsBudget',
            [50, 100, 200].map((v) => [v, String(v)]),
          ) +
          select('outage', 'commonsOutage', [
            ['none', t('commonsNone')],
            ['paris', 'Paris'],
            ['tenerife', 'Tenerife'],
            ['canberra', 'Canberra'],
          ]) +
          `<label>${t('commonsSeed')}<input id="seed" name="seed" type="number" min="0" max="4294967295" step="1" value="42" required></label>`
        : select(
            'snr',
            'commonsSnr',
            [10, 25, 50].map((v) => [v, String(v)]),
          ) +
          select(
            'maxDriftHzSec',
            'commonsDriftLimit',
            [1, 4].map((v) => [v, String(v)]),
          );
  const description =
    kind === 'benchmark'
      ? t('commonsBenchQuestion')
      : kind === 'market'
        ? t('commonsMarketQuestion')
        : t('commonsCitizenQuestion');
  const route = '/space/commons/' + kind;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${commonsNames[kind]} · ${e(t('commonsTitle'))}</title><meta name="description" content="${e(description)}"><meta property="og:title" content="${commonsNames[kind]}"><meta property="og:description" content="${e(description)}"><meta name="twitter:card" content="summary">${['fr', 'en', 'es'].map((l) => `<link rel="alternate" hreflang="${l}" href="${publicMode ? '/' + l : ''}${route}?lang=${l}">`).join('')}<link rel="stylesheet" href="/space.css"><link rel="stylesheet" href="/space-commons.css"><script type="module" src="/space-commons.js"></script></head><body data-kind="${kind}" data-public="${publicMode}"><header><a class="brand" href="/">↗ <span>Contact Market</span></a><nav class="header-links" aria-label="FR / EN / ES">${['fr', 'en', 'es'].map((l) => `<a class="commons-language" lang="${l}" href="${publicMode ? '/' + l : ''}${route}?lang=${l}" ${l === lang ? 'aria-current="page"' : ''}>${l.toUpperCase()}</a>`).join('')}</nav></header><main><nav class="commons-tabs" aria-label="SOTA+++">${commonsKinds.map((k) => `<a href="${publicMode ? '/' + lang : ''}/space/commons/${k}?lang=${lang}" ${k === kind ? 'aria-current="page"' : ''}>${commonsNames[k]}</a>`).join('')}<a href="https://github.com/gbesse/mission-benchmark-commons">Mission Benchmark Commons ↗</a><a href="https://github.com/gbesse/citizen-mission">Citizen Mission ↗</a></nav><section class="hero"><p class="eyebrow">${e(t('commonsBadge'))}</p><h1>${commonsNames[kind]}</h1><p>${e(description)}</p><p class="notice">${e(commonsNotices[kind][lang])}</p>${publicMode ? `<p class="notice">${e(t('commonsStatic'))}</p>` : ''}<a href="${publicMode ? '/' + lang : ''}/space-method?lang=${lang}">${e(t('commonsSetup'))} ↗</a></section><section class="panel"><form id="commons-form"><div class="controls">${control}<button type="button" id="commons-daily">${e(t('commonsDaily'))}</button></div><p id="commons-day"></p><label for="commons-prediction">${e(t('commonsPredict'))}</label><input type="number" step="any" id="commons-prediction" value="${kind === 'citizen' ? '-0.37' : kind === 'market' ? '400' : '5'}"><div class="controls"><button id="commons-replay" type="button">${e(t('commonsReplay'))}</button>${publicMode ? '' : `<button id="commons-run" type="submit">${e(t('commonsRun'))}</button>`}<button type="button" id="commons-check" disabled>${e(t('commonsCheck'))}</button></div></form><p role="status" aria-live="polite" id="commons-status"></p><p id="commons-score"></p><div class="controls"><button type="button" id="commons-share">${e(t('commonsShare'))}</button><button type="button" id="commons-export" disabled>${e(t('commonsExport'))}</button><button type="button" id="commons-card" disabled>${e(t('commonsCard'))}</button></div><label for="commons-link" class="sr-only">${e(t('commonsShare'))}</label><input id="commons-link" readonly type="url"></section><section class="panel"><h2>${e(t('commonsResults'))}</h2><div id="commons-results">${summary ? `<noscript><p>${e(summary)}</p></noscript>` : ''}</div><div id="commons-chart"></div><div class="table-scroll" id="commons-table"></div></section><section class="panel"><h2>${e(t('commonsProvenance'))}</h2><div id="commons-provenance"></div><details><summary>JSON</summary><pre id="commons-json"></pre></details></section><section class="panel"><h2>${e(t('commonsHistory'))}</h2><p>${e(t('commonsHistoryNote'))}</p><div class="table-scroll" id="commons-history"></div></section></main></body></html>`;
}

export { renderCommonsMethod } from './method.js';
