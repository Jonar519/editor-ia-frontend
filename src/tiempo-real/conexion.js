// Conexión del navegador con el servidor en tiempo real (bloque L; ADR 0002 del backend). La usan la vista
// de lectura y el editor:
//   1. pide un ticket de un solo uso con el access token (POST /api/tiempo-real/tickets);
//   2. abre el WebSocket con el ticket en Sec-WebSocket-Protocol (nunca en la URL);
//   3. sincroniza el Y.Doc (protocolo de y-protocols) y la presencia;
//   4. informa el estado de red, y reconecta según el código de cierre.
//
// Códigos de cierre (ADR 0002): 4401 sesión terminada (intenta refrescar el access token una vez),
// 4403 el permiso cambió (pide un ticket nuevo: si ya no hay acceso, el ticket da 404), 4404 documento
// borrado, 4400 mensaje mal formado (no reintenta); el resto (sin red, 4408, 4429, 1001, 1013) reintenta con
// espera exponencial y algo de azar.
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { readSyncMessage, writeSyncStep1 } from 'y-protocols/sync';
import { ErrorApi } from '../api/errores.js';

const MENSAJE = { sync: 0, presencia: 1, control: 2 };
/** Origen de lo que llega del servidor (para no volver a mandarlo). */
const DEL_SERVIDOR = Symbol('servidor');

/**
 * @typedef {'conectando' | 'conectado' | 'reconectando' | 'sin-acceso' | 'borrado' | 'sesion-terminada' | 'error'} EstadoRed
 * @typedef {{
 *   solicitar: (ruta: string, op?: import('../api/cliente.js').OpcionesSolicitud) => Promise<any>,
 *   refrescar: () => Promise<boolean>,
 * }} ApiMinima
 */

/** Espera antes del intento n (empieza en 0,5 s, se duplica hasta 30 s, con azar de ±20 %). */
export function esperaReconexion(/** @type {number} */ intento, azar = Math.random()) {
  const base = Math.min(500 * 2 ** intento, 30_000);
  return Math.round(base * (0.8 + 0.4 * azar));
}

/**
 * @param {{
 *   documentoId: string,
 *   doc: import('yjs').Doc,
 *   presencia: import('y-protocols/awareness').Awareness,
 *   api: ApiMinima,
 *   alEstado: (e: EstadoRed) => void,
 *   alRol?: (rol: string) => void,
 *   url?: string,
 * }} o
 */
export function conectarDocumento(o) {
  const url = o.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/tiempo-real`;
  /** @type {WebSocket | null} */
  let ws = null;
  let terminado = false;
  let intentos = 0;
  let reintentoPermiso = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let temporizador = null;

  const enviar = (/** @type {Uint8Array} */ marco) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(/** @type {Uint8Array<ArrayBuffer>} */ (marco));
  };

  /** @param {Uint8Array} u @param {unknown} origen */
  const alCambio = (u, origen) => {
    if (origen === DEL_SERVIDOR) return;
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.sync);
    encoding.writeVarUint(e, 2);
    encoding.writeVarUint8Array(e, u);
    enviar(encoding.toUint8Array(e));
  };
  o.doc.on('update', alCambio);

  /** @param {{ added: number[], updated: number[], removed: number[] }} cambios @param {unknown} origen */
  const alPresencia = ({ added, updated, removed }, origen) => {
    if (origen !== 'local') return;
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.presencia);
    encoding.writeVarUint8Array(e, encodeAwarenessUpdate(o.presencia, [...added, ...updated, ...removed]));
    enviar(encoding.toUint8Array(e));
  };
  o.presencia.on('update', alPresencia);

  const terminar = (/** @type {EstadoRed} */ estado) => {
    terminado = true;
    o.alEstado(estado);
  };

  const reintentar = () => {
    if (terminado) return;
    o.alEstado('reconectando');
    temporizador = setTimeout(() => void abrir(), esperaReconexion(intentos++));
  };

  async function abrir() {
    if (terminado) return;
    if (intentos === 0) o.alEstado('conectando');
    /** @type {string} */
    let ticket;
    try {
      ticket = (await o.api.solicitar('/tiempo-real/tickets', { metodo: 'POST', cuerpo: { documentoId: o.documentoId } })).ticket;
    } catch (err) {
      if (err instanceof ErrorApi && err.estado === 404) return terminar('sin-acceso');
      if (err instanceof ErrorApi && err.estado === 401) return terminar('sesion-terminada');
      return reintentar(); // sin red o servidor caído
    }
    if (terminado) return;
    const socket = new WebSocket(url, ['cuaderno.v1', `ticket.${ticket}`]);
    socket.binaryType = 'arraybuffer';
    ws = socket;
    socket.onopen = () => {
      intentos = 0;
      o.alEstado('conectado');
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MENSAJE.sync);
      writeSyncStep1(e, o.doc);
      enviar(encoding.toUint8Array(e));
      if (o.presencia.getLocalState() !== null) {
        const p = encoding.createEncoder();
        encoding.writeVarUint(p, MENSAJE.presencia);
        encoding.writeVarUint8Array(p, encodeAwarenessUpdate(o.presencia, [o.doc.clientID]));
        enviar(encoding.toUint8Array(p));
      }
    };
    socket.onmessage = (ev) => {
      const dec = decoding.createDecoder(new Uint8Array(/** @type {ArrayBuffer} */ (ev.data)));
      const tipo = decoding.readVarUint(dec);
      if (tipo === MENSAJE.sync) {
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, MENSAJE.sync);
        readSyncMessage(dec, e, o.doc, DEL_SERVIDOR);
        if (encoding.length(e) > 1) enviar(encoding.toUint8Array(e));
      } else if (tipo === MENSAJE.presencia) {
        applyAwarenessUpdate(o.presencia, decoding.readVarUint8Array(dec), DEL_SERVIDOR);
      } else if (tipo === MENSAJE.control) {
        const c = /** @type {{ tipo?: string, rol?: string }} */ (JSON.parse(decoding.readVarString(dec)));
        if (c.tipo === 'rol' && c.rol) {
          reintentoPermiso = false;
          o.alRol?.(c.rol);
        }
      }
    };
    socket.onclose = (ev) => {
      if (ws !== socket) return;
      ws = null;
      // Sin conexión no se sabe quién sigue: la presencia ajena se borra y vuelve con la reconexión.
      const ajenos = [...o.presencia.getStates().keys()].filter((id) => id !== o.doc.clientID);
      removeAwarenessStates(o.presencia, ajenos, DEL_SERVIDOR);
      if (terminado) return;
      if (ev.code === 4404) return terminar('borrado');
      if (ev.code === 4400) return terminar('error');
      if (ev.code === 4401) {
        void o.api.refrescar().then((ok) => (ok ? abrir() : terminar('sesion-terminada')));
        return;
      }
      if (ev.code === 4403) {
        // El permiso cambió: un ticket nuevo dice si sigue habiendo acceso (y con qué rol). Una sola vez seguida.
        if (reintentoPermiso) return terminar('sin-acceso');
        reintentoPermiso = true;
        void abrir();
        return;
      }
      reintentar();
    };
  }

  void abrir();

  return {
    /** Cierra a propósito (al salir de la vista): sin reintentos, y la presencia se va. */
    cerrar() {
      terminado = true;
      if (temporizador) clearTimeout(temporizador);
      o.presencia.setLocalState(null);
      o.doc.off('update', alCambio);
      o.presencia.off('update', alPresencia);
      ws?.close(1000);
      ws = null;
    },
  };
}
