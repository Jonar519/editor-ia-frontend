// La sesión de la aplicación: un único cliente del API y lo que el router necesita saber (el rol).
// Al abrir la página no hay access token (vive solo en memoria): se pide uno con la cookie de refresco.
// Si no hay cookie válida, no hay sesión. El inicio de sesión llega en el bloque I.
import { crearClienteApi } from './api/cliente.js';

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
