// Reglas puras del bloque J (cuenta y administración), separadas del DOM para probarlas sin navegador.
// La validación previa NO reemplaza al servidor: solo evita un viaje por errores evidentes.

/** Lo mismo que exige el backend (ActualizarPerfil e InvitacionSolicitud: z.string().trim().max(80)). */
export const NOMBRE_MAXIMO = 80;

/**
 * @param {string} texto
 * @returns {string | null} el problema, o null si sirve
 */
export function problemaNombre(texto) {
  const n = texto.trim();
  if (n.length === 0) return 'Escribe un nombre.';
  if (n.length > NOMBRE_MAXIMO) return `Usa como máximo ${String(NOMBRE_MAXIMO)} caracteres.`;
  return null;
}

/**
 * Teléfono en formato internacional E.164 (lo mismo que la base: + y de 7 a 15 dígitos, sin 0 inicial).
 * Se aceptan espacios, guiones, puntos y paréntesis al escribirlo. Vacío = quitar el teléfono.
 * @param {string} texto
 * @returns {{ valor: string | null } | { problema: string }}
 */
export function normalizarTelefono(texto) {
  const t = texto.replace(/[\s().-]+/g, '');
  if (t === '') return { valor: null };
  if (!/^\+[1-9]\d{6,14}$/.test(t)) return { problema: 'Escríbelo en formato internacional, con + y el código del país: +1 555 010 0123.' };
  return { valor: t };
}

// ─── Avatar ─────────────────────────────────────────────────────────────────────

/** Lado del avatar que se sube (px). El servidor admite hasta 4096 y 1 MiB. */
export const LADO_AVATAR = 512;
/** Lado de respaldo para un PNG que a 512 px pasara de 1 MiB (256² × 4 bytes nunca llega). */
export const LADO_AVATAR_RESPALDO = 256;
export const BYTES_MAXIMOS_AVATAR = 1024 * 1024;
/** Archivo de origen más grande que se intenta leer (se vuelve a codificar a 512 px). */
export const BYTES_MAXIMOS_ORIGEN = 20 * 1024 * 1024;
export const ZOOM_MAXIMO = 4;

const entre = (/** @type {number} */ v, /** @type {number} */ min, /** @type {number} */ max) => Math.min(Math.max(Number.isFinite(v) ? v : min, min), max);

/**
 * Recorte cuadrado dentro de la imagen. zoom 1 = el cuadrado más grande que cabe; x e y (0 a 1) dicen
 * dónde queda dentro del espacio que sobra (0,5 = centrado). El cuadrado NUNCA sale de la imagen.
 * @param {number} ancho
 * @param {number} alto
 * @param {{ zoom: number, x: number, y: number }} p
 * @returns {{ sx: number, sy: number, lado: number }}
 */
export function recorteCuadrado(ancho, alto, p) {
  const lado = Math.max(1, Math.floor(Math.min(ancho, alto) / entre(p.zoom, 1, ZOOM_MAXIMO)));
  return {
    sx: Math.round((ancho - lado) * entre(p.x, 0, 1)),
    sy: Math.round((alto - lado) * entre(p.y, 0, 1)),
    lado,
  };
}

/**
 * Formato de salida: el mismo tipo que el original. Un PNG sigue siendo PNG para no perder la
 * transparencia (en JPEG quedaría negra).
 * @param {string} tipoOrigen
 * @returns {'image/png' | 'image/jpeg' | null} null si no es JPEG ni PNG
 */
export function tipoDeSalida(tipoOrigen) {
  if (tipoOrigen === 'image/png') return 'image/png';
  if (tipoOrigen === 'image/jpeg') return 'image/jpeg';
  return null;
}

// ─── Eliminar la cuenta ─────────────────────────────────────────────────────────

/**
 * Lo que hay que transferir antes de eliminar la cuenta (los detalles del 409 propiedad_compartida).
 * Solo entradas con la forma esperada: lo demás se descarta.
 * @param {unknown} err
 * @returns {{ tipo: 'documento' | 'espacio', id: string, nombre: string }[]}
 */
export function bloqueosDeEliminacion(err) {
  const e = /** @type {{ codigo?: unknown, detalles?: unknown }} */ (err ?? {});
  if (e.codigo !== 'propiedad_compartida' || !Array.isArray(e.detalles)) return [];
  return e.detalles.filter(
    (d) => d !== null && typeof d === 'object' && (d.tipo === 'documento' || d.tipo === 'espacio') && typeof d.id === 'string' && typeof d.nombre === 'string',
  );
}

// ─── Paginación ─────────────────────────────────────────────────────────────────

/**
 * @param {{ total: number, limite: number, desde: number }} p
 * @returns {{ primero: number, ultimo: number, anterior: number | null, siguiente: number | null }}
 *   primero y último son 1-based para mostrarlos ("1 a 20 de 45"); anterior/siguiente son el "desde"
 *   de esa página, o null si no hay.
 */
export function pagina(p) {
  const ultimo = Math.min(p.desde + p.limite, p.total);
  return {
    primero: p.total === 0 ? 0 : p.desde + 1,
    ultimo,
    anterior: p.desde > 0 ? Math.max(0, p.desde - p.limite) : null,
    siguiente: ultimo < p.total ? ultimo : null,
  };
}
