import { project } from './project.js';
import { commonsNotices } from './commons.js';
import { messageTranslations } from './i18n.js';
export function renderCommonsMethod(locale = 'fr') {
  const lang = ['fr', 'en', 'es'].includes(locale) ? locale : 'fr',
    index = { fr: 0, en: 1, es: 2 }[lang];
  const e = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const details = [
    [
      'Les données et archives sont vérifiées par SHA-256. Les moteurs et grands fichiers restent dans .local/space-runtime ; SPACE_RUNTIME peut désigner un runtime installé.',
      'Data and archives are verified with SHA-256. Engines and large files remain in .local/space-runtime; SPACE_RUNTIME may point to an installed runtime.',
      'Datos y archivos se verifican con SHA-256. Motores y archivos grandes permanecen en .local/space-runtime; SPACE_RUNTIME puede indicar un runtime instalado.',
    ],
    [
      'Rejouer relit des calculs réellement exécutés. Exécuter lance les moteurs locaux ; aucun résultat synthétique de secours. Les défis quotidiens parcourent un catalogue archivé.',
      'Replay reads computations that were actually executed. Run starts local engines; no synthetic fallback. Daily challenges rotate through an archived catalog.',
      'Reproducir lee cálculos ejecutados realmente. Ejecutar inicia motores locales; sin sustitución sintética. Los desafíos diarios recorren un catálogo archivado.',
    ],
    [
      'URL de paramètres, prédiction scorée, historique local, preuve JSON et carte PNG. L’édition statique rejoue les preuves sans publier l’API locale. Les scores sont pédagogiques ; aucun paiement ni trafic mesuré.',
      'Parameter URLs, scored prediction, local history, JSON evidence and PNG cards. The static edition replays evidence without publishing the local API. Scores are educational; no payment or measured traffic.',
      'URL de parámetros, predicción evaluada, historial local, prueba JSON y tarjetas PNG. La edición estática reproduce pruebas sin publicar la API local. Puntuaciones educativas; sin pago ni tráfico medido.',
    ],
  ];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(messageTranslations.commonsSetup[index])} · ${e(project.name)}</title><link rel="stylesheet" href="/space.css"></head><body><header><a class="brand" href="/space/commons/${project.kind}?lang=${lang}">↗ <span>${e(project.name)}</span></a><nav class="header-links">${['fr', 'en', 'es'].map((l) => `<a href="?lang=${l}">${l.toUpperCase()}</a>`).join('')}</nav></header><main><h1>${e(messageTranslations.commonsSetup[index])}</h1><p>${e(project.purpose[index])}</p><p class="notice">${e(project.prerequisites[index])}</p><p>${e(project.tools.join(' · '))}</p><pre>npm run setup:engines\nnpm run test:engines\nnode bin/cli.js run --locale=${lang}\nnpm run build</pre><p class="notice">${e(commonsNotices[project.kind][lang])}</p>${details.map((row) => `<p>${e(row[index])}</p>`).join('')}<a href="https://github.com/gbesse/${project.slug}">GitHub ↗</a></main></body></html>`;
}
