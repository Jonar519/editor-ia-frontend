// Borrar la copia local de los documentos (bloque M). Aparte de almacen-local.js para que la primera carga
// (sesion.js lo usa al cerrar la sesión) no traiga Yjs.

export const NOMBRE_BASE = 'cuaderno-local';

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
