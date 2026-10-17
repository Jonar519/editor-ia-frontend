// Tokens de un solo uso que llegan en el FRAGMENTO del enlace de un correo (#/invitacion/<token>,
// #/recuperar/<token>, #/correo/<token>). El fragmento nunca viaja al servidor, pero sí queda en la barra
// de direcciones, en el historial, en los marcadores y en una captura de pantalla. Por eso se BORRA de la
// URL con history.replaceState en cuanto se lee, ANTES de cualquier petición, sea válido o no.
// Desde ahí el token vive solo en memoria, en la vista que lo usa.

/** Forma de los tokens del backend: 32 bytes en base64url. */
const FORMA_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/**
 * @param {string | undefined} token el parámetro que extrajo el router
 * @param {string} base la ruta SIN el token, por ejemplo "#/invitacion"
 * @param {{ history: Pick<History, 'replaceState'> }} [ventana]
 * @returns {string | null} el token si tiene la forma correcta; null si no
 */
export function consumirToken(token, base, ventana = window) {
  ventana.history.replaceState(null, '', base);
  return typeof token === 'string' && FORMA_TOKEN.test(token) ? token : null;
}
