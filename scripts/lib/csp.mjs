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
//   - connect-src: 'self' y SOLO el origen del API (VITE_API_URL), en https y en wss (http y ws en local).
//     El frontend y el API están en orígenes distintos del mismo sitio (despliegue).
import { normalizarOrigenApi, origenWebSocket } from '../../src/api/origen.js';

/** Las directivas fijas, antes y después de connect-src (que depende del origen del API). */
const ANTES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'style-src-elem': ["'self'", "'unsafe-inline'"],
  'style-src-attr': ["'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
};
const DESPUES = {
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'self'"],
};

/**
 * Las directivas de la política para un origen de API.
 * @param {string} origenApi
 * @returns {Record<string, string[]>}
 */
export const directivas = (origenApi) => ({ ...ANTES, 'connect-src': ["'self'", origenApi, origenWebSocket(origenApi)], ...DESPUES });

/**
 * La política como texto, para la <meta>.
 * @param {string} origenApi
 */
export const politica = (origenApi) =>
  Object.entries(directivas(origenApi))
    .map(([nombre, fuentes]) => `${nombre} ${fuentes.join(' ')}`)
    .join('; ');

/**
 * El origen del API para el build. En Vercel (VERCEL=1) es OBLIGATORIO y https: un build de producción sin
 * VITE_API_URL apuntaría en silencio al backend de desarrollo.
 * @param {string | undefined} valor
 * @param {{ enVercel?: boolean }} [o]
 */
export function origenApiDelBuild(valor, o = {}) {
  if (o.enVercel && !valor) throw new Error('Falta VITE_API_URL en las variables de entorno de Vercel');
  const origen = normalizarOrigenApi(valor);
  if (o.enVercel && !origen.startsWith('https://')) throw new Error(`VITE_API_URL debe ser https en Vercel: ${origen}`);
  return origen;
}
