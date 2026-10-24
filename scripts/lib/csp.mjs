// La política de seguridad de contenido (bloque R, decisiones escritas). La usa vite.config.js (como <meta>
// en el index.html del build) y la revisa tests/unitarias/csp.test.mjs.
//
//   - script-src 'self' ESTRICTO: sin 'unsafe-inline' ni 'unsafe-eval' (una prueba y una mutación fallan si
//     se añaden). Es la protección principal contra un script inyectado.
//   - Estilos: 'unsafe-inline' SOLO en style-src-elem y style-src-attr (opción 1, aprobada por escrito):
//       · style-src-elem: CodeMirror (style-mod) mete su CSS en un <style>; solo usa hojas construidas
//         dentro de un shadow root;
//       · style-src-attr: la presencia de y-codemirror.next pone style="background-color: …" en el cursor y
//         la selección remotos (con lib0/dom, empaquetado en el chunk compartido de la vista renderizada).
//     Riesgo residual R-06 (inyección de CSS) en el modelo de amenazas del backend. Salida para el
//     despliegue: nonce por respuesta desde el servidor (EditorView.cspNonce) y frame-ancestors por cabecera.
//   - worker-src 'self': la comparación de versiones corre en un Web Worker propio; el Service Worker
//     también es propio.

/** @type {Record<string, string[]>} */
export const DIRECTIVAS = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'style-src-elem': ["'self'", "'unsafe-inline'"],
  'style-src-attr': ["'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'self'"],
};

/** La política como texto, para la <meta>. */
export const CSP = Object.entries(DIRECTIVAS)
  .map(([nombre, fuentes]) => `${nombre} ${fuentes.join(' ')}`)
  .join('; ');
