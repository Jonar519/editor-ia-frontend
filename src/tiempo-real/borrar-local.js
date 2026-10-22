// Borrar la copia local de los documentos (bloque M). Aparte de almacen-local.js para que la primera carga
// (sesion.js lo usa al cerrar la sesión) no traiga Yjs.

export const NOMBRE_BASE = 'cuaderno-local';
export const VERSION_BASE = 2;
/** Tienda con cuántos cambios sin enviar tiene cada documento (clave: id del documento). */
export const SIN_ENVIAR = 'sin-enviar';

/**
 * Cuántos cambios no llegaron al servidor, y en cuántos documentos (para avisar antes de salir). No crea
 * la base si no existe. Nunca lanza: sin IndexedDB, 0.
 * @param {IDBFactory} [idb]
 * @returns {Promise<{ cambios: number, documentos: number }>}
 */
export async function contarSinEnviar(idb) {
  const nada = { cambios: 0, documentos: 0 };
  try {
    const f = idb ?? globalThis.indexedDB;
    if (!f) return nada;
    return await new Promise((resolver) => {
      const pedido = f.open(NOMBRE_BASE);
      // Si no existía, no se crea: se aborta la creación.
      pedido.onupgradeneeded = () => pedido.transaction?.abort();
      pedido.onerror = () => resolver(nada);
      pedido.onsuccess = () => {
        const bd = pedido.result;
        if (!bd.objectStoreNames.contains(SIN_ENVIAR)) {
          bd.close();
          return resolver(nada);
        }
        const todos = bd.transaction(SIN_ENVIAR, 'readonly').objectStore(SIN_ENVIAR).getAll();
        todos.onsuccess = () => {
          bd.close();
          const n = /** @type {unknown[]} */ (todos.result).map(Number).filter((x) => x > 0);
          resolver({ cambios: n.reduce((a, b) => a + b, 0), documentos: n.length });
        };
        todos.onerror = () => {
          bd.close();
          resolver(nada);
        };
      };
    });
  } catch {
    return nada;
  }
}

/**
 * Borra TODA la copia local (cerrar sesión, eliminar la cuenta, restablecer la contraseña). Nunca lanza.
 * @param {IDBFactory} [idb]
 */
export async function borrarDatosLocales(idb) {
  try {
    const f = idb ?? globalThis.indexedDB;
    if (!f) return;
    const pedido = f.deleteDatabase(NOMBRE_BASE);
    await new Promise((resolver) => {
      pedido.onsuccess = resolver;
      pedido.onerror = resolver;
      // Otra pestaña que no la suelta: el borrado queda en cola y ocurre cuando la cierre.
      pedido.onblocked = resolver;
    });
  } catch {
    // sin IndexedDB: no hay nada que borrar
  }
}
