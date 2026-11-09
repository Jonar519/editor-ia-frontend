// Origen del API (funciones puras: las usan el navegador, scripts/lib/csp.mjs para la CSP del build y las
// pruebas). En producción el frontend y el API están en orígenes distintos del MISMO sitio
// (cuaderno.<dominio> y api-cuaderno.<dominio>): la cookie de refresco es SameSite=Strict y viaja porque
// los dos comparten el dominio padre.
//
// VITE_API_URL es SOLO un origen (esquema + host + puerto opcional), sin ruta, query ni credenciales: las
// rutas (/api/…, /api/tiempo-real) las agrega el código. Vacío = el backend de desarrollo, que coincide
// con el APP_URL por defecto del backend (http://127.0.0.1:5175 → http://127.0.0.1:4200: mismo sitio).

export const API_POR_DEFECTO = 'http://127.0.0.1:4200';

/**
 * El origen del API a partir de VITE_API_URL, o un error que dice qué está mal.
 * @param {unknown} valor
 * @returns {string}
 */
export function normalizarOrigenApi(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!texto) return API_POR_DEFECTO;
  /** @type {URL} */
  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new Error(`VITE_API_URL no es una URL válida: "${texto}"`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`VITE_API_URL debe empezar por https:// (o http:// en local): "${texto}"`);
  }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`VITE_API_URL debe ser solo el origen, sin ruta ni query (ej. https://api.example.com): "${texto}"`);
  }
  return url.origin;
}

/**
 * El origen de los WebSocket de ese API: https → wss, http → ws.
 * @param {string} origenApi
 */
export function origenWebSocket(origenApi) {
  const url = new URL(origenApi);
  return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
}
