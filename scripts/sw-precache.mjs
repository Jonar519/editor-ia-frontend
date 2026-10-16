// Lista de precarga y versión del Service Worker, calculadas a partir del bundle de Vite/Rolldown.
// Precarga SOLO el armazón: "/", la entrada con sus importaciones estáticas, su CSS y las vistas
// públicas (src/vistas/publico/). El código de los demás roles y las fuentes se cachean al usarse.
import { createHash } from 'node:crypto';

/**
 * Forma mínima de cada archivo del bundle (la que usa el plugin de vite.config.js).
 * @typedef {{ archivo: string, tipo: 'chunk' | 'asset', esEntrada?: boolean, modulo?: string | null, importaciones?: string[], css?: string[] }} ArchivoBundle
 */

/**
 * @param {ArchivoBundle[]} archivos
 * @returns {string[]} rutas absolutas ("/assets/...") a precargar
 */
export function listaPrecache(archivos) {
  const porNombre = new Map(archivos.map((a) => [a.archivo, a]));
  /** @type {Set<string>} */
  const lista = new Set();
  /** @param {string} nombre */
  const agregar = (nombre) => {
    const a = porNombre.get(nombre);
    if (!a || lista.has(nombre)) return;
    lista.add(nombre);
    for (const i of a.importaciones ?? []) agregar(i);
    for (const c of a.css ?? []) lista.add(c);
  };
  for (const a of archivos) {
    if (a.tipo !== 'chunk') continue;
    const publica = /\/src\/vistas\/publico\//.test((a.modulo ?? '').replace(/\\/g, '/'));
    if (a.esEntrada || publica) agregar(a.archivo);
  }
  return ['/', ...[...lista].sort().map((n) => `/${n}`)];
}

/**
 * Versión del Service Worker: cambia si cambia CUALQUIER archivo del build (nombres con hash), así una
 * versión nueva siempre reemplaza la caché anterior.
 * @param {string[]} nombres
 */
export function versionDe(nombres) {
  return createHash('sha256').update([...nombres].sort().join('\n')).digest('hex').slice(0, 16);
}
