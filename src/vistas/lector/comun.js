// Piezas comunes de las pantallas de "Tu cuenta": la navegación entre secciones, el perfil, las fechas y
// el avatar (se pide con el token: la ruta exige sesión, así que no puede ir en un <img src>).
import { aviso, h } from '../../dom.js';
import { anunciar } from '../../componentes/anunciar.js';
import { api } from '../../sesion.js';

/**
 * @typedef {{
 *   id: string, nombre: string, correo: string, telefono: string | null, rol: 'admin' | 'editor' | 'lector',
 *   creadaEn: string, activadaEn: string | null, mfaActivo: boolean,
 *   avatar: { tipo: string, ancho: number, alto: number, hash: string } | null,
 *   cambioCorreoPendiente: { correoNuevo: string, expiraEn: string } | null
 * }} Perfil
 */

export const ROLES = { admin: 'Administración', editor: 'Edición', lector: 'Lectura' };

/** Las secciones de la cuenta, en el orden de la navegación. */
export const SECCIONES = /** @type {const} */ ([
  ['/cuenta', 'Perfil'],
  ['/cuenta/foto', 'Foto'],
  ['/cuenta/correo', 'Correo'],
  ['/cuenta/contrasena', 'Contraseña'],
  ['/cuenta/dos-pasos', 'Verificación en dos pasos'],
  ['/cuenta/sesiones', 'Sesiones'],
  ['/cuenta/datos', 'Tus datos'],
]);

/**
 * La sección con su título y la navegación de la cuenta (la actual, con aria-current="page").
 * @param {string} camino
 * @param {string} titulo
 * @param {...(Node | null)} contenido
 */
export function paginaCuenta(camino, titulo, ...contenido) {
  const nav = h(
    'nav',
    { class: 'subnav', 'aria-label': 'Secciones de tu cuenta' },
    h('ul', {}, ...SECCIONES.map(([c, t]) => h('li', {}, h('a', { href: `#${c}`, 'aria-current': c === camino ? 'page' : undefined }, t)))),
  );
  return h('section', {}, h('h1', { tabindex: '-1' }, titulo), nav, ...contenido);
}

/** @param {AbortSignal} [senal] @returns {Promise<Perfil>} */
export const cargarPerfil = (senal) => api.solicitar('/cuenta', { senal });

const FORMATO = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

/** Fecha y hora legibles, con el valor exacto en <time datetime>. */
export function fechaHora(/** @type {string} */ iso) {
  return h('time', { datetime: iso }, FORMATO.format(new Date(iso)));
}

/**
 * Muestra un resultado: visible en `donde` y anunciado en la región viva (el foco no se mueve).
 * @param {HTMLElement} donde
 * @param {'info' | 'exito' | 'advertencia'} tipo
 * @param {string} texto
 */
export function resultado(donde, tipo, texto) {
  donde.replaceChildren(aviso(tipo, texto));
  anunciar(texto);
}

/**
 * El avatar de una cuenta como <img>, pedido con el token. El blob URL se libera en cuanto la imagen se
 * dibujó (la imagen ya decodificada sigue a la vista).
 * @param {string} usuarioId
 * @param {string} alt
 * @returns {Promise<HTMLImageElement>}
 */
export async function imagenAvatar(usuarioId, alt) {
  /** @type {import('../../api/cliente.js').Archivo} */
  const a = await api.solicitar(`/usuarios/${encodeURIComponent(usuarioId)}/avatar`, { comoArchivo: true });
  const url = URL.createObjectURL(a.blob);
  const img = h('img', { class: 'avatar', alt, src: url, width: '128', height: '128' });
  const liberar = () => URL.revokeObjectURL(url);
  img.addEventListener('load', liberar, { once: true });
  img.addEventListener('error', liberar, { once: true });
  return img;
}

/**
 * Lugar para el avatar: muestra "Sin foto" o la imagen cuando llega (sin bloquear el resto).
 * @param {Perfil} p
 */
export function lugarAvatar(p) {
  const lugar = h('div', { class: 'lugar-avatar' });
  if (!p.avatar) {
    lugar.append(h('p', { class: 'suave' }, 'Sin foto.'));
    return lugar;
  }
  lugar.append(h('p', { class: 'cargando', role: 'status' }, 'Cargando la foto…'));
  imagenAvatar(p.id, 'Tu foto de perfil').then(
    (img) => lugar.replaceChildren(img),
    () => lugar.replaceChildren(h('p', { class: 'suave' }, 'No se pudo cargar la foto.')),
  );
  return lugar;
}
