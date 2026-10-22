// Copia local de los documentos que se editan (bloque M): las actualizaciones de Yjs en IndexedDB, para que
// lo escrito sin conexión sobreviva a cerrar la página y se envíe al volver.
//
// Privacidad:
//   - Solo el EDITOR guarda (quien solo lee no tiene nada propio que conservar).
//   - Una sola base ("cuaderno-local") y de UNA cuenta: si abre otra cuenta en este navegador, se vacía
//     antes de guardar nada suyo.
//   - Se borra entera al cerrar la sesión, al eliminar la cuenta y al restablecer la contraseña; y la copia
//     de un documento, cuando se pierde el acceso a él o se elimina.
//   - Nunca guarda tokens ni datos de la cuenta: solo el id de la cuenta dueña y las actualizaciones.
//
// Si IndexedDB no está disponible o falla (modo privado, cuota llena), el editor sigue en memoria y la vista
// lo dice: lo escrito sin conexión se pierde al cerrar la página.
import * as Y from 'yjs';
import { NOMBRE_BASE, SIN_ENVIAR, VERSION_BASE } from './borrar-local.js';
/** Al cargar, si hay más filas que esto, se juntan en una sola. */
export const FILAS_PARA_COMPACTAR = 100;

/**
 * @typedef {{
 *   cargar: () => Promise<Uint8Array[]>,
 *   guardar: (actualizacion: Uint8Array) => Promise<void>,
 *   reemplazar: (estado: Uint8Array) => Promise<void>,
 *   borrar: () => Promise<void>,
 *   sinEnviar: () => Promise<number>,
 *   marcarSinEnviar: (cuantos: number) => Promise<void>,
 * }} Almacen
 *   sinEnviar: cuántos cambios de este documento no llegaron al servidor (para avisar antes de salir).
 */

/** @param {IDBRequest | IDBTransaction} r */
function esperar(r) {
  return new Promise((resolver, rechazar) => {
    if ('oncomplete' in r) {
      r.oncomplete = () => resolver(undefined);
      r.onabort = () => rechazar(r.error ?? new Error('transacción abortada'));
      r.onerror = () => rechazar(r.error);
    } else {
      r.onsuccess = () => resolver(r.result);
      r.onerror = () => rechazar(r.error);
    }
  });
}

/** @param {IDBFactory} idb */
function abrirBase(idb) {
  const pedido = idb.open(NOMBRE_BASE, VERSION_BASE);
  pedido.onupgradeneeded = (ev) => {
    const bd = pedido.result;
    if (ev.oldVersion < 1) {
      const cambios = bd.createObjectStore('cambios', { autoIncrement: true });
      cambios.createIndex('documento', 'documento');
      bd.createObjectStore('dueno');
    }
    // Versión 2 (bloque N): cuántos cambios sin enviar tiene cada documento.
    if (ev.oldVersion < 2) bd.createObjectStore(SIN_ENVIAR);
  };
  return /** @type {Promise<IDBDatabase>} */ (esperar(pedido)).then((bd) => {
    // Al borrar la base (cerrar sesión), las conexiones abiertas se cierran para no bloquearlo.
    bd.onversionchange = () => bd.close();
    return bd;
  });
}

/**
 * El almacén de un documento para una cuenta. Si la base era de otra cuenta, la vacía primero.
 * @param {{ usuarioId: string, documentoId: string, idb?: IDBFactory }} o
 * @returns {Promise<Almacen>}
 */
export async function abrirAlmacen(o) {
  const bd = await abrirBase(o.idb ?? indexedDB);
  const t = bd.transaction(['cambios', 'dueno', SIN_ENVIAR], 'readwrite');
  const pedido = t.objectStore('dueno').get('cuenta');
  pedido.onsuccess = () => {
    if (pedido.result === o.usuarioId) return;
    t.objectStore('cambios').clear();
    t.objectStore(SIN_ENVIAR).clear();
    t.objectStore('dueno').put(o.usuarioId, 'cuenta');
  };
  await esperar(t);
  const doc = o.documentoId;

  /**
   * Borra las filas del documento y, en la MISMA transacción, agrega `nueva` (si hay). Todo dentro de los
   * callbacks: un await en medio podría dejar cerrada la transacción.
   * @param {Uint8Array | null} nueva
   */
  const reescribir = (nueva) => {
    const tx = bd.transaction('cambios', 'readwrite');
    const tienda = tx.objectStore('cambios');
    const c = tienda.index('documento').openKeyCursor(IDBKeyRange.only(doc));
    c.onsuccess = () => {
      const cursor = c.result;
      if (cursor) {
        tienda.delete(cursor.primaryKey);
        cursor.continue();
      } else if (nueva) {
        tienda.add({ documento: doc, datos: nueva });
      }
    };
    return esperar(tx);
  };

  /** @type {Almacen} */
  const almacen = {
    async cargar() {
      const tx = bd.transaction('cambios', 'readonly');
      const filas = /** @type {{ documento: string, datos: Uint8Array }[]} */ (await esperar(tx.objectStore('cambios').index('documento').getAll(IDBKeyRange.only(doc))));
      const datos = filas.map((f) => f.datos);
      if (datos.length > FILAS_PARA_COMPACTAR) await almacen.reemplazar(Y.mergeUpdates(datos));
      return datos;
    },
    async guardar(actualizacion) {
      const tx = bd.transaction('cambios', 'readwrite');
      tx.objectStore('cambios').add({ documento: doc, datos: actualizacion });
      await esperar(tx);
    },
    async reemplazar(estado) {
      await reescribir(estado);
    },
    async borrar() {
      await reescribir(null);
      await almacen.marcarSinEnviar(0);
    },
    async sinEnviar() {
      const tx = bd.transaction(SIN_ENVIAR, 'readonly');
      return Number((await esperar(tx.objectStore(SIN_ENVIAR).get(doc))) ?? 0);
    },
    async marcarSinEnviar(cuantos) {
      const tx = bd.transaction(SIN_ENVIAR, 'readwrite');
      if (cuantos > 0) tx.objectStore(SIN_ENVIAR).put(cuantos, doc);
      else tx.objectStore(SIN_ENVIAR).delete(doc);
      await esperar(tx);
    },
  };
  return almacen;
}
