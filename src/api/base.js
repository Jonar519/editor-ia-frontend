// URLs absolutas del API a partir de VITE_API_URL (fijada en el build). Ninguna se arma con location.host:
// la página y el API están en orígenes distintos.
import { normalizarOrigenApi, origenWebSocket } from './origen.js';

/** El origen del API de este build (https://api-cuaderno.<dominio> en producción). */
export const ORIGEN_API = normalizarOrigenApi(import.meta.env.VITE_API_URL);

/** Base de las rutas REST: "<origen>/api". */
export const BASE_API = `${ORIGEN_API}/api`;

/** URL del WebSocket del tiempo real: "wss://<origen>/api/tiempo-real" (ws:// en local). */
export const URL_TIEMPO_REAL = `${origenWebSocket(ORIGEN_API)}/api/tiempo-real`;
