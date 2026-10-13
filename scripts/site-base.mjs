export function normalizeBasePath(value = '') {
  if (value === '' || value === '/') return '';
  const clean = value.endsWith('/') ? value.slice(0, -1) : value;
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(clean))
    throw new Error(
      'FR : chemin de site invalide. EN: invalid site path. ES: ruta de sitio no válida.',
    );
  return clean;
}
export function mountHTML(html, basePath) {
  const base = normalizeBasePath(basePath);
  return html
    .replace(/(href|src)="\/(?!\/)/g, (_, attr) => `${attr}="${base}/`)
    .replace('<body ', `<body data-base-path="${base}" `);
}
