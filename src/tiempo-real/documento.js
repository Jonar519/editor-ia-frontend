// Un documento en vivo en el navegador: el Y.Doc, la presencia y la conexión, para la vista de lectura y
// el editor. Se cierra solo al salir de la vista (cambia la ruta) o al cerrar la página.
//
// Con `persistir` (el editor, bloque M), el Y.Doc arranca con la copia local (almacen-local.js) ANTES de
// conectar, y cada actualización (propia o del servidor) se guarda en orden. Así lo escrito sin conexión
// sobrevive a cerrar la página y sale en el paso 2 de la próxima conexión.
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { api } from '../sesion.js';
import { abrirAlmacen, FILAS_PARA_COMPACTAR } from './almacen-local.js';
import { conectarDocumento } from './conexion.js';
import { normalizarPresencia } from './presencia.js';

/** El único texto del documento (ADR 0003 del backend). */
export const NOMBRE_TEXTO = 'contenido';
/** Origen de lo que viene de la copia local (no se vuelve a guardar). */
const DE_LA_COPIA = Symbol('copia-local');

/**
 * @typedef {'sin-copia' | 'con-copia' | 'copia-fallo'} EstadoCopia
 *   sin-copia: no se guarda en el dispositivo (lectura); con-copia: se guarda; copia-fallo: no se pudo.
 */

/**
 * @param {{
 *   documentoId: string,
 *   alEstado: (e: import('./conexion.js').EstadoRed) => void,
 *   alRol?: (rol: string) => void,
 *   alPendiente?: (hay: boolean, cuantos: number) => void,
 *   alCopia?: (e: EstadoCopia) => void,
 *   alRechazados?: () => void,
 *   persistir?: { usuarioId: string },
 *   ventana?: Window,
 *   deps?: {
 *     api?: import('./conexion.js').ApiMinima,
 *     abrirAlmacen?: typeof abrirAlmacen,
 *     WebSocket?: typeof WebSocket,
 *     espera?: (intento: number) => number,
 *     url?: string,
 *   },
 * }} o  deps: para las pruebas (convergencia); la aplicación usa los de verdad.
 */
export async function abrirDocumento(o) {
  const w = o.ventana ?? window;
  const deps = o.deps ?? {};
  const doc = new Y.Doc();
  const presencia = new Awareness(doc);
  // Antes que cualquier oyente que dibuje (el editor): ver presencia.js.
  const dejarDeNormalizar = normalizarPresencia(presencia);

  /** @type {import('./almacen-local.js').Almacen | null} */
  let almacen = null;
  /** @type {Promise<void>} */
  let cola = Promise.resolve();
  const fallo = () => {
    almacen = null;
    o.alCopia?.('copia-fallo');
  };
  let sinEnviarInicial = 0;
  if (o.persistir) {
    try {
      almacen = await (deps.abrirAlmacen ?? abrirAlmacen)({ usuarioId: o.persistir.usuarioId, documentoId: o.documentoId });
      sinEnviarInicial = await almacen.sinEnviar();
      const guardadas = await almacen.cargar();
      Y.transact(doc, () => {
        for (const u of guardadas) Y.applyUpdate(doc, u, DE_LA_COPIA);
      }, DE_LA_COPIA);
      o.alCopia?.('con-copia');
    } catch {
      fallo();
    }
    let filas = 0;
    doc.on('update', (/** @type {Uint8Array} */ u, /** @type {unknown} */ origen) => {
      if (origen === DE_LA_COPIA || !almacen) return;
      const a = almacen;
      // En orden y sin bloquear la edición; un fallo (cuota, base borrada) deja de guardar y se avisa.
      // Cada tanto, las filas se reemplazan por el estado completo (la copia no crece sin límite).
      const compactar = ++filas % FILAS_PARA_COMPACTAR === 0;
      cola = cola.then(() => (compactar ? a.reemplazar(Y.encodeStateAsUpdate(doc)) : a.guardar(u))).catch(fallo);
    });
  } else {
    o.alCopia?.('sin-copia');
  }
  /** Borra la copia local de este documento (sin acceso, eliminado o cambios rechazados). */
  const olvidarCopia = () => {
    const a = almacen;
    almacen = null;
    if (a) cola = cola.then(() => a.borrar()).catch(() => undefined);
  };

  /** @type {Set<() => void>} */
  const oyentesComentarios = new Set();
  /** @type {Set<(c: Record<string, unknown>) => void>} */
  const oyentesControl = new Set();

  // El estado local va vacío: el servidor le pone la cuenta y el nombre; el editor, el cursor.
  presencia.setLocalState({});
  const conexion = conectarDocumento({
    documentoId: o.documentoId,
    doc,
    presencia,
    api: deps.api ?? api,
    WebSocket: deps.WebSocket,
    espera: deps.espera,
    url: deps.url,
    ventana: w,
    alEstado: (e) => {
      if (e === 'sin-acceso' || e === 'borrado') olvidarCopia();
      o.alEstado(e);
    },
    alRol: o.alRol,
    // Los comentarios cambiaron (bloque N): quien los muestra los vuelve a pedir.
    alComentarios: () => {
      for (const f of oyentesComentarios) f();
    },
    alControl: (c) => {
      for (const f of oyentesControl) f(c);
    },
    sinEnviarInicial,
    alPendiente: (hay, cuantos) => {
      // Cuántos cambios sin enviar, en la copia: salir de la cuenta avisa con ese número.
      const a = almacen;
      if (a) cola = cola.then(() => a.marcarSinEnviar(cuantos)).catch(fallo);
      o.alPendiente?.(hay, cuantos);
    },
    alRechazados: () => {
      olvidarCopia();
      o.alRechazados?.();
    },
  });

  const hash = w.location.hash;
  const cerrar = () => {
    w.removeEventListener('hashchange', alCambiarRuta);
    w.removeEventListener('pagehide', cerrar);
    conexion.cerrar();
    dejarDeNormalizar();
    presencia.destroy();
    doc.destroy();
  };
  const alCambiarRuta = () => {
    if (w.location.hash !== hash) cerrar();
  };
  w.addEventListener('hashchange', alCambiarRuta);
  w.addEventListener('pagehide', cerrar);

  return {
    doc,
    texto: doc.getText(NOMBRE_TEXTO),
    presencia,
    cerrar,
    guardado: () => cola,
    /** Avisa cuando los comentarios del documento cambiaron (en otro navegador). Devuelve cómo dejar de oír. */
    alCambiarComentarios: (/** @type {() => void} */ f) => {
      oyentesComentarios.add(f);
      return () => oyentesComentarios.delete(f);
    },
    /** Mensajes de control propios (bloque Q, autocompletado): mandar y oír. */
    control: {
      enviar: (/** @type {unknown} */ m) => conexion.enviarControl(m),
      oir: (/** @type {(c: Record<string, unknown>) => void} */ f) => {
        oyentesControl.add(f);
        return () => oyentesControl.delete(f);
      },
    },
  };
}
