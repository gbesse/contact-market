import { messageTranslations } from './i18n.js';
import {
  commonsDefaults,
  commonsConfig,
  commonsLink,
  readCommons,
  dailyCommons,
} from './space-lib/commons.js';
const $ = (id) => document.getElementById(id),
  kind = document.body.dataset.kind,
  locale = document.documentElement.lang,
  index = { fr: 0, en: 1, es: 2 }[locale],
  publicMode = document.body.dataset.public === 'true',
  basePath = document.body.dataset.basePath || '';
const t = (key, params = {}) =>
  messageTranslations[key][index].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
const e = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const number = (value) => Number(value).toLocaleString(locale, { maximumFractionDigits: 5 });
let report = null,
  day = null,
  busy = false;
function config() {
  return commonsConfig(
    kind,
    Object.fromEntries(
      Object.entries(commonsDefaults[kind]).map(([key, value]) => [
        key,
        typeof value === 'number' ? Number($(key).value) : $(key).value,
      ]),
    ),
  );
}
function load(config) {
  for (const [key, value] of Object.entries(config)) $(key).value = String(value);
}
function link() {
  const target = new URL(commonsLink(location.origin, kind, config(), locale, day));
  if (publicMode) target.pathname = basePath + '/' + locale + target.pathname;
  const url = target.href;
  $('commons-link').value = url;
  history.replaceState(null, '', url);
  $('commons-day').textContent = day ? `${t('commonsDaily')} · ${day}` : '';
  for (const a of document.querySelectorAll('.commons-language')) {
    const alternate = new URL(commonsLink(location.origin, kind, config(), a.lang, day));
    if (publicMode) alternate.pathname = basePath + '/' + a.lang + alternate.pathname;
    a.href = alternate.href;
  }
  return url;
}
function invalidate() {
  report = null;
  $('commons-results').replaceChildren();
  $('commons-chart').replaceChildren();
  $('commons-table').replaceChildren();
  $('commons-provenance').replaceChildren();
  $('commons-json').textContent = '';
  $('commons-score').textContent = '';
  for (const id of ['commons-export', 'commons-card', 'commons-check']) $(id).disabled = true;
}
function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${e(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function metric(label, value) {
  return `<div class="commons-metric">${e(t(label))}<strong>${e(value)}</strong></div>`;
}
function chartLine(samples, key, label, color) {
  const max = Math.max(1e-9, ...samples.map((s) => s[key])),
    duration = samples.at(-1).timeSec;
  const points = samples
    .map((s) => `${60 + (s.timeSec / duration) * 820},${270 - (s[key] / max) * 220}`)
    .join(' ');
  return `<svg viewBox="0 0 920 310" role="img" aria-label="${e(label)}"><text x="60" y="25">${e(label)} · max ${e(number(max))}</text><path d="M60 45V270H880" fill="none" stroke="#354650"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/><text x="60" y="294">0 s</text><text x="795" y="294">${duration} s</text></svg>`;
}
function render() {
  const r = report.result;
  $('commons-status').textContent =
    t(report.execution === 'fresh' ? 'commonsFresh' : 'commonsCached') + ` · ${report.executedAt}`;
  if (kind === 'benchmark') {
    $('commons-results').innerHTML =
      metric('commonsDifference', number(r.maxEngineDifferenceM)) +
      metric('commonsResidual', number(r.maxReferenceResidualM)) +
      metric('commonsEnergy', r.relativeEnergyDrift.toExponential(3)) +
      metric(r.passed ? 'commonsPass' : 'commonsFail', r.toleranceM + ' m');
    $('commons-chart').innerHTML =
      chartLine(r.samples, 'engineDifferenceM', t('commonsDifference'), '#72ebc1') +
      chartLine(r.samples, 'referenceResidualM', t('commonsResidual'), '#fbb86c');
    $('commons-table').innerHTML = table(
      ['s', t('commonsDifference'), t('commonsResidual')],
      r.samples
        .filter((_, i) => i % Math.max(1, Math.floor(r.samples.length / 12)) === 0)
        .map((s) => [s.timeSec, number(s.engineDifferenceM), number(s.referenceResidualM)]),
    );
  } else if (kind === 'market') {
    const gap =
      Math.max(0, r.objectiveBound - r.objectiveValue) / Math.max(1, Math.abs(r.objectiveValue));
    $('commons-results').innerHTML =
      metric('commonsValue', r.scienceValue) +
      metric('commonsSpent', `${r.spentUnits} / ${report.config.budgetUnits}`) +
      metric('commonsBaseline', r.baseline.scienceValue) +
      metric('commonsGain', r.scienceValue - r.baseline.scienceValue) +
      metric('commonsOptimal', r.solverStatus) +
      metric('commonsGap', (gap * 100).toFixed(5) + '%');
    const stations = ['paris', 'tenerife', 'canberra'];
    $('commons-chart').innerHTML =
      `<svg viewBox="0 0 960 215" role="img" aria-label="${e(t('commonsContact'))}">${stations.map((s, i) => `<text x="10" y="${50 + i * 50}">${s}</text>`).join('')}${r.contacts.map((c) => `<rect x="${100 + (c.start / 86400) * 830}" y="${30 + stations.indexOf(c.station) * 50}" width="${((c.end - c.start) / 86400) * 830}" height="30" fill="${c.station === report.config.outage ? '#963f3f' : '#355d64'}"><title>${e(c.id)} · ${number(c.maxElevationDeg)}°</title></rect>`).join('')}${r.awards.map((a) => `<rect x="${100 + (a.start / 86400) * 830}" y="${35 + stations.indexOf(a.station) * 50}" width="${Math.max(2, ((a.end - a.start) / 86400) * 830)}" height="20" fill="#72ebc1"><title>${e(a.requestId)} · ${a.scienceValue}</title></rect>`).join('')}<text x="100" y="205">0 s</text><text x="850" y="205">86400 s</text></svg>`;
    $('commons-table').innerHTML =
      `<h3>${e(t('commonsSchedule'))}</h3>` +
      table(
        [
          'ID',
          t('commonsContact'),
          t('commonsStart'),
          t('commonsEnd'),
          'MB',
          t('commonsValue'),
          t('commonsCost'),
        ],
        r.awards.map((a) => [
          a.requestId,
          a.station,
          a.start,
          a.end,
          a.bytes / 1e6,
          a.scienceValue,
          a.costUnits,
        ]),
      );
    if (r.transportProof?.verified)
      $('commons-results').innerHTML += metric('commonsTransport', r.transportProof.bytes + ' B');
    if (r.receiptVerified) $('commons-results').innerHTML += metric('commonsReceipt', 'Ed25519');
  } else {
    $('commons-results').innerHTML =
      metric('commonsHits', r.hits.length) +
      metric('commonsMeasuredDrift', number(r.measuredPeakDriftHzSec)) +
      metric('commonsCarrier', `${r.carrierHits} · ${r.channelHz.toFixed(3)} Hz`);
    const width = r.waterfallDb[0].length,
      height = r.waterfallDb.length;
    $('commons-chart').innerHTML =
      `<h3>${e(t('commonsWaterfall'))}</h3><svg viewBox="0 0 960 310" role="img" aria-label="${e(t('commonsWaterfall'))}">${r.waterfallDb.flatMap((row, y) => row.map((v, x) => `<rect x="${60 + (x / width) * 860}" y="${40 + (y / height) * 225}" width="${860 / width + 0.2}" height="${225 / height + 0.2}" fill="hsl(${195 - Math.min(1, Math.max(0, v) / 18) * 155} 75% ${15 + Math.min(1, Math.max(0, v) / 18) * 55}%)"/>`)).join('')}<text x="60" y="25">${r.mjdStart} MJD · ${r.sampleSeconds.toFixed(3)} s / ${e(t('commonsSample'))}</text><text x="60" y="294">${r.bandMHz[1].toFixed(5)} MHz</text><text x="760" y="294">${r.bandMHz[0].toFixed(5)} MHz</text></svg>`;
    $('commons-table').innerHTML = table(
      ['ID', t('commonsFrequency'), t('commonsRate'), 'SNR'],
      r.hits.map((h) => [h.id, h.frequencyMHz, h.driftHzSec, number(h.snr)]),
    );
  }
  $('commons-provenance').innerHTML =
    `<p>${r.engines.map((x) => `${e(x.name)} ${e(x.version)}`).join(' · ')}</p><p>SHA-256 · ${e(report.evidenceSha256)}</p>${r.sources.map((s) => `<p><a href="${e(s.url)}" rel="noopener noreferrer">${e(s.publisher)} · ${e(s.id)} ↗</a><br>SHA-256 · ${e(s.sha256)}</p>`).join('')}<p>${e(report.notices[locale])}</p>`;
  $('commons-json').textContent = JSON.stringify(report, null, 2);
  for (const id of ['commons-export', 'commons-card', 'commons-check']) $(id).disabled = false;
  let rows = [];
  try {
    rows = JSON.parse(localStorage.getItem('space.commons.history') || '[]');
    if (!Array.isArray(rows)) rows = [];
  } catch {}
  const measure =
    kind === 'benchmark'
      ? r.maxEngineDifferenceM
      : kind === 'market'
        ? r.scienceValue
        : r.measuredPeakDriftHzSec;
  rows = [
    { id: report.id, kind, measure, at: report.executedAt, url: link() },
    ...rows.filter((row) => row.id !== report.id),
  ].slice(0, 12);
  try {
    localStorage.setItem('space.commons.history', JSON.stringify(rows));
  } catch {}
  $('commons-history').innerHTML = table(
    ['ID', t('commonsResults'), 'UTC'],
    rows.map((row) => [row.id, number(row.measure), row.at]),
  );
}
async function execute(fresh) {
  if (busy) return;
  busy = true;
  for (const control of $('commons-form').querySelectorAll('input,select')) control.disabled = true;
  invalidate();
  $('commons-status').textContent = t('commonsRunning');
  for (const button of [$('commons-run'), $('commons-replay'), $('commons-daily')])
    if (button) button.disabled = true;
  try {
    const current = config();
    link();
    let response;
    if (fresh) {
      const session = await (await fetch('/api/session')).json();
      response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-project-token': session.token },
        body: JSON.stringify({ kind, config: current, locale }),
      });
    } else {
      const query = new URLSearchParams({ kind, ...current });
      response = await fetch(
        publicMode
          ? `${basePath}/space-evidence/${kind}-${await configHash(current)}.json`
          : '/api/replay?' + query,
      );
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        response.status === 404
          ? 'commonsMissing'
          : error.code === 'COMMONS_BUSY'
            ? 'commonsBusy'
            : response.status === 400
              ? 'commonsInvalid'
              : 'commonsUnavailable',
      );
    }
    report = await response.json();
    await validateEvidence(report, current);
    render();
  } catch (error) {
    $('commons-status').textContent = t(
      ['COMMONS_CONFIG', 'COMMONS_VERSION'].includes(error.message)
        ? 'commonsInvalid'
        : error.message in messageTranslations
          ? error.message
          : 'commonsUnavailable',
    );
  } finally {
    busy = false;
    for (const control of $('commons-form').querySelectorAll('input,select'))
      control.disabled = false;
    for (const button of [$('commons-run'), $('commons-replay'), $('commons-daily')])
      if (button) button.disabled = false;
  }
}
async function validateEvidence(value, current) {
  const digest = async (text) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
  if (
    value.version !== 'commons-v1' ||
    value.kind !== kind ||
    JSON.stringify(value.config, Object.keys(value.config).sort()) !==
      JSON.stringify(current, Object.keys(current).sort()) ||
    value.evidenceSha256 !==
      (await digest(
        JSON.stringify({ kind: value.kind, config: value.config, result: value.result }),
      ))
  )
    throw new Error('commonsUnavailable');
  if (kind === 'market') {
    const receipt = value.result.receipt,
      manifest = JSON.stringify({
        schemaVersion: 1,
        config: value.config,
        awards: value.result.awards,
      });
    const payloadHash = await digest(manifest),
      proof = value.result.transportProof;
    if (
      !proof?.verified ||
      payloadHash !== proof.sentSha256 ||
      payloadHash !== proof.receivedSha256 ||
      receipt.payload.manifestSha256 !== payloadHash ||
      receipt.payload.settledUnits !== value.result.spentUnits ||
      receipt.payload.returnedUnits + receipt.payload.settledUnits !== current.budgetUnits
    )
      throw new Error('commonsUnavailable');
    const decode = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      'spki',
      decode(receipt.publicKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        'Ed25519',
        key,
        decode(receipt.signature),
        new TextEncoder().encode(JSON.stringify(receipt.payload)),
      ))
    )
      throw new Error('commonsUnavailable');
  }
}
async function configHash(value) {
  const sorted = JSON.stringify(value, Object.keys(value).sort()),
    bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sorted));
  return [...new Uint8Array(bytes)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}
function download(bytes, type, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('commons-form').addEventListener('submit', (event) => {
  event.preventDefault();
  execute(true);
});
$('commons-replay').onclick = () => execute(false);
$('commons-daily').onclick = () => {
  day = new Date().toISOString().slice(0, 10);
  load(dailyCommons(kind, day));
  invalidate();
  link();
  $('commons-status').textContent = t('commonsStartChallenge');
};
for (const key of Object.keys(commonsDefaults[kind]))
  $(key).addEventListener('change', () => {
    invalidate();
    day = null;
    try {
      link();
      $('commons-status').textContent = '';
    } catch {
      $('commons-status').textContent = t('commonsInvalid');
    }
  });
$('commons-share').onclick = async () => {
  try {
    const url = link();
    await navigator.clipboard.writeText(url);
    $('commons-status').textContent = t('commonsCopied');
  } catch {
    $('commons-link').select();
  }
};
$('commons-export').onclick = () => {
  if (report)
    download(
      JSON.stringify(
        { ...report, locale, notice: report.notices[locale], challengeUrl: link() },
        null,
        2,
      ),
      'application/json',
      `${report.id}-${locale}.json`,
    );
};
$('commons-check').onclick = () => {
  if (!report) return;
  const input = Number($('commons-prediction').value);
  if (!Number.isFinite(input) || !$('commons-prediction').value) {
    $('commons-score').textContent = t('commonsInvalid');
    return;
  }
  const target =
      kind === 'benchmark'
        ? report.result.maxEngineDifferenceM
        : kind === 'market'
          ? report.result.scienceValue
          : report.result.measuredPeakDriftHzSec,
    error = Math.abs(input - target),
    scale = kind === 'citizen' ? 0.05 : Math.max(1, Math.abs(target) * 0.2),
    score = Math.max(0, Math.round(100 * (1 - error / scale)));
  $('commons-score').textContent = t('commonsScore', {
    score,
    error: number(error),
    unit: kind === 'citizen' ? 'Hz/s' : kind === 'benchmark' ? 'm' : '',
  });
};
$('commons-card').onclick = () => {
  if (!report) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101c26';
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#72ebc1';
  ctx.font = 'bold 45px system-ui';
  ctx.fillText(
    {
      benchmark: 'Mission Benchmark Commons',
      market: 'Contact Market',
      citizen: 'Citizen Mission',
    }[kind],
    55,
    85,
  );
  ctx.font = '25px system-ui';
  ctx.fillStyle = '#ecf4f4';
  const labels = [
    kind === 'benchmark'
      ? `${t('commonsDifference')}: ${number(report.result.maxEngineDifferenceM)}`
      : kind === 'market'
        ? `${t('commonsValue')}: ${report.result.scienceValue}`
        : `${t('commonsMeasuredDrift')}: ${number(report.result.measuredPeakDriftHzSec)}`,
    t(report.execution === 'fresh' ? 'commonsFresh' : 'commonsCached'),
    report.result.engines.map((x) => `${x.name} ${x.version}`).join(' · '),
    `${report.id} · ${locale.toUpperCase()}`,
    kind === 'market'
      ? t('commonsBudget')
      : kind === 'citizen'
        ? t('commonsCarrier')
        : t('commonsResidual') + ': ' + number(report.result.maxReferenceResidualM),
  ];
  labels.forEach((label, i) => ctx.fillText(label, 55, 160 + i * 65, 1090));
  ctx.font = '18px system-ui';
  ctx.fillText(new URL(link()).pathname, 55, 560, 1090);
  canvas.toBlob((blob) => {
    if (blob) download(blob, 'image/png', `${report.id}-${locale}.png`);
  });
};
try {
  const currentURL = new URL(location.href);
  if (publicMode && [basePath, basePath + '/'].includes(currentURL.pathname))
    currentURL.pathname = basePath + '/space/commons/' + kind;
  const shared = readCommons(currentURL.href);
  load(shared.config);
  day = shared.day;
  link();
  $('commons-status').textContent = t('commonsStartChallenge');
} catch {
  $('commons-status').textContent = t('commonsInvalid');
}
