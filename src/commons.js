export const commonsKinds = ['market'];
export const commonsVersion = 'commons-v1';
export const commonsDefaults = {
  benchmark: { profile: 'iss', stepSec: 30 },
  market: { budgetUnits: 100, outage: 'none', seed: 42 },
  citizen: { snr: 25, maxDriftHzSec: 4 },
};
export function commonsConfig(kind, input = {}) {
  if (!commonsKinds.includes(kind) || !input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('COMMONS_CONFIG');
  const config = { ...commonsDefaults[kind] };
  const allowed = {
    profile: ['iss', 'moon'],
    stepSec: [10, 30, 60, 120],
    budgetUnits: [50, 100, 200],
    outage: ['none', 'paris', 'tenerife', 'canberra'],
    snr: [10, 25, 50],
    maxDriftHzSec: [1, 4],
  };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(config, key)) throw new Error('COMMONS_CONFIG');
    if (
      key === 'seed'
        ? !Number.isSafeInteger(value) || value < 0 || value > 4294967295
        : !allowed[key].includes(value)
    )
      throw new Error('COMMONS_CONFIG');
    config[key] = value;
  }
  return config;
}
export function commonsLink(origin, kind, config = {}, locale = 'fr', day) {
  const url = new URL('/space/commons/' + kind, origin);
  url.searchParams.set('lang', ['fr', 'en', 'es'].includes(locale) ? locale : 'fr');
  url.searchParams.set('v', commonsVersion);
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) url.searchParams.set('day', day);
  for (const [key, value] of Object.entries(commonsConfig(kind, config)))
    url.searchParams.set(key, String(value));
  return url.href;
}
export function readCommons(url) {
  const u = new URL(url),
    kind = u.pathname.split('/').filter(Boolean).at(-1);
  const config = {};
  if (u.searchParams.has('v') && u.searchParams.get('v') !== commonsVersion)
    throw new Error('COMMONS_VERSION');
  for (const key of Object.keys(commonsDefaults[kind] ?? {}))
    if (u.searchParams.has(key))
      config[key] =
        typeof commonsDefaults[kind][key] === 'number'
          ? Number(u.searchParams.get(key))
          : u.searchParams.get(key);
  const day = u.searchParams.get('day');
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('COMMONS_CONFIG');
  return {
    kind,
    config: commonsConfig(kind, config),
    locale: ['fr', 'en', 'es'].includes(u.searchParams.get('lang'))
      ? u.searchParams.get('lang')
      : 'fr',
    day,
  };
}
export function dailyCommons(kind, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('COMMONS_CONFIG');
  const seed = [...day].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 0);
  return commonsConfig(
    kind,
    kind === 'market'
      ? {
          seed: 42,
          budgetUnits: [50, 100, 200][seed % 3],
          outage: ['none', 'paris', 'tenerife', 'canberra'][seed % 4],
        }
      : kind === 'benchmark'
        ? { profile: seed % 2 ? 'moon' : 'iss', stepSec: [10, 30, 60, 120][seed % 4] }
        : { snr: [10, 25, 50][seed % 3], maxDriftHzSec: seed % 2 ? 1 : 4 },
  );
}
export const commonsNotices = {
  benchmark: {
    fr: 'Basilisk RK4 et Orekit KeplerianPropagator partagent le même état initial, la même gravité et des axes inertiels fixes. Le résidu SGP4/JPL mesure aussi les limites du modèle à deux corps. Ce benchmark ne qualifie pas un logiciel de vol.',
    en: 'Basilisk RK4 and Orekit KeplerianPropagator share the same initial state, gravity and fixed inertial axes. The SGP4/JPL residual also measures two-body model limitations. This benchmark does not qualify flight software.',
    es: 'Basilisk RK4 y Orekit KeplerianPropagator comparten el estado inicial, la gravedad y ejes inerciales fijos. El residuo SGP4/JPL también mide las limitaciones del modelo de dos cuerpos. Este benchmark no certifica software de vuelo.',
  },
  market: {
    fr: 'Géométrie ISS issue du TLE archivé du 10 octobre 2026, échantillonnée à 30 s, élévation minimale 10°. Antennes urbaines, débits, requêtes, valeurs scientifiques et crédits sont des hypothèses. ION transfère le manifeste sur localhost ; il ne prouve pas une liaison radio ni un paiement réel.',
    en: 'ISS geometry uses the archived October 10, 2026 TLE, sampled every 30 s with 10° minimum elevation. City antennas, rates, requests, scientific values and credits are assumptions. ION transfers the manifest over localhost; it does not prove a radio link or a real payment.',
    es: 'La geometría de la ISS usa el TLE archivado del 10 de octubre de 2026, con muestras cada 30 s y elevación mínima de 10°. Antenas urbanas, tasas, solicitudes, valores científicos y créditos son supuestos. ION transfiere el manifiesto por localhost; no demuestra un enlace de radio ni un pago real.',
  },
  citizen: {
    fr: 'Observation radio publique de Voyager 1 au GBT, lue par blimpy et analysée par turboSETI sur CPU. Le signal vient d’une sonde humaine connue. Aucune observation OFF n’est disponible ici : ces détections ne démontrent pas un signal extraterrestre.',
    en: 'Public GBT radio observation of Voyager 1, read with blimpy and searched with turboSETI on CPU. The signal comes from a known human spacecraft. No OFF observation is available here: these detections do not establish an extraterrestrial signal.',
    es: 'Observación pública de radio de Voyager 1 en GBT, leída con blimpy y analizada con turboSETI en CPU. La señal procede de una sonda humana conocida. No hay observación OFF disponible: estas detecciones no demuestran una señal extraterrestre.',
  },
};
