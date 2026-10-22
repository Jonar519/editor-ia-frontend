// La sesión de la aplicación: un único cliente del API y lo que el router necesita saber (el rol).
// Al abrir la página no hay access token (vive solo en memoria): se pide uno con la cookie de refresco.
// Si no hay cookie válida, no hay sesión.
import { crearClienteApi } from './api/cliente.js';
import { borrarDatosLocales } from './tiempo-real/borrar-local.js';

export const api = crearClienteApi();

/** @returns {import('./router.js').Sesion} */
export function sesionParaRouter() {
  const u = api.usuario();
  return u ? { rol: u.rol } : null;
}

/** Intenta recuperar la sesión al abrir la página. Nunca lanza: sin red o sin cookie, no hay sesión. */
export async function restaurarSesion() {
  try {
    return await api.refrescar();
  } catch {
    return false;
  }
}

/** Adónde ir después de entrar si nadie pidió otra cosa. */
export const DESTINO_POR_DEFECTO = '/documentos';

/** @type {string | null} */
let destino = null;

/**
 * Recuerda la sección protegida que se quiso abrir sin sesión, para volver a ella después de entrar.
 * Solo caminos internos de la aplicación: nunca una URL (no se puede redirigir fuera de Cuaderno).
 * @param {string} camino
 */
export function recordarDestino(camino) {
  if (/^\/[a-z]/.test(camino) && !camino.startsWith('/entrar')) destino = camino;
}

/** El destino recordado (y lo olvida), o el de por defecto. */
export function tomarDestino() {
  const d = destino ?? DESTINO_POR_DEFECTO;
  destino = null;
  return d;
}

/**
 * Cierra la sesión en el servidor (si se puede) y la olvida aquí siempre, con la copia local de los
 * documentos (bloque M): en un equipo compartido, la siguiente persona no la encuentra.
 */
export async function cerrarSesion() {
  try {
    await api.solicitar('/auth/sesion', { metodo: 'DELETE' });
  } catch {
    // Sin red o con la sesión ya vencida: igual se olvida localmente.
  }
  await borrarDatosLocales();
  api.olvidarSesion();
}
