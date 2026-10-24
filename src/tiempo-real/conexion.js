// Conexión del navegador con el servidor en tiempo real (bloques L y M; ADR 0002 del backend). La usan la
// vista de lectura y el editor:
//   1. pide un ticket de un solo uso con el access token (POST /api/tiempo-real/tickets);
//   2. abre el WebSocket con el ticket en Sec-WebSocket-Protocol (nunca en la URL);
//   3. sincroniza el Y.Doc (protocolo de y-protocols) y la presencia;
//   4. informa el estado de red, y reconecta según el código de cierre (y en cuanto vuelve la red).
//
// Sin conexión (M): los cambios siguen en el Y.Doc (y en la copia local del editor). Al volver, el servidor
// manda su vector de estado (paso 1) y el cliente responde con TODO lo que el servidor no tiene (paso 2).
// Yjs identifica cada cambio por (cliente, reloj): reenviar algo que el servidor ya tiene no lo duplica, y
// lo que llega fuera de orden espera a sus dependencias. Por eso no hay pérdida ni duplicados.
//
// Códigos de cierre (ADR 0002): 4401 sesión terminada (intenta refrescar el access token una vez),
// 4403 el permiso cambió (pide un ticket nuevo: si ya no hay acceso, el ticket da 404), 4404 documento
// borrado, 4400 mensaje mal formado y 4413 documento demasiado grande (no reintenta); el resto (sin red,
// 4408, 4429, 1001, 1013) reintenta con espera exponencial y algo de azar.
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { ErrorApi } from '../api/errores.js';

const MENSAJE = { sync: 0, presencia: 1, control: 2 };
const SYNC = { paso1: 0, paso2: 1, actualizacion: 2 };
/** Tope de un mensaje en el servidor (LIMITES_PRODUCCION.mensajeBytes): uno mayor cierra con 1009. */
export const MENSAJE_MAXIMO_BYTES = 1024 * 1024;
/** Origen de lo que llega del servidor (para no volver a mandarlo). */
export const DEL_SERVIDOR = Symbol('servidor');

/**
 * @typedef {'conectando' | 'conectado' | 'reconectando' | 'sin-acceso' | 'borrado' | 'sesion-terminada' | 'demasiado-grande' | 'error'} EstadoRed
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

const escribe = (/** @type {string | null} */ rol) => rol === 'editor' || rol === 'propietario';

/**
 * ¿El documento local tiene cambios que el servidor no (según su vector de estado)? Compara inserciones:
 * un cambio que solo borra no avanza el reloj y no se ve aquí (igual se envía en el paso 2).
 * @param {import('yjs').Doc} doc @param {Uint8Array} vectorServidor
 */
export function adelantado(doc, vectorServidor) {
  const servidor = Y.decodeStateVector(vectorServidor);
  for (const [cliente, reloj] of Y.decodeStateVector(Y.encodeStateVector(doc))) {
    if (reloj > (servidor.get(cliente) ?? 0)) return true;
  }
  return false;
}

/**
 * @param {{
 *   documentoId: string,
 *   doc: import('yjs').Doc,
 *   presencia: import('y-protocols/awareness').Awareness,
 *   api: ApiMinima,
 *   alEstado: (e: EstadoRed) => void,
 *   alRol?: (rol: string) => void,
 *   alPendiente?: (hay: boolean, cuantos: number) => void,
 *   alRechazados?: () => void,
 *   alComentarios?: () => void,
 *   alControl?: (c: Record<string, unknown>) => void,
 *   sinEnviarInicial?: number,
 *   url?: string,
 *   ventana?: Pick<Window, 'addEventListener' | 'removeEventListener'>,
 *   WebSocket?: typeof WebSocket,
 *   espera?: (intento: number) => number,
 * }} o
 */
export function conectarDocumento(o) {
  const url = o.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/tiempo-real`;
  const Ws = o.WebSocket ?? WebSocket;
  const w = o.ventana ?? window;
  const espera = o.espera ?? ((n) => esperaReconexion(n));
  /** @type {WebSocket | null} */
  let ws = null;
  let terminado = false;
  let intentos = 0;
  let reintentoPermiso = false;
  /** El rol de la conexión ACTUAL (null hasta que el servidor lo dice). */
  /** @type {string | null} */
  let rol = null;
  /**
   * Cambios locales que el servidor quizá no tiene (se escribieron sin conexión): cuántos. Arranca con lo
   * que quedó de la vez anterior (la copia local lo recuerda).
   */
  let sinEnviar = o.sinEnviarInicial ?? 0;
  let pendiente = sinEnviar > 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let temporizador = null;

  /** true: un cambio más sin enviar; false: todo enviado. */
  const ponerPendiente = (/** @type {boolean} */ hay) => {
    if (!hay && sinEnviar === 0) return;
    sinEnviar = hay ? sinEnviar + 1 : 0;
    pendiente = hay;
    o.alPendiente?.(hay, sinEnviar);
  };

  const terminar = (/** @type {EstadoRed} */ estado) => {
    terminado = true;
    if (temporizador) clearTimeout(temporizador);
    w.removeEventListener('online', alVolverRed);
    o.alEstado(estado);
    const s = ws;
    ws = null;
    s?.close(1000);
  };

  /** Manda si está abierta. Devuelve false si no se pudo (sin conexión o demasiado grande). */
  const enviar = (/** @type {Uint8Array} */ marco) => {
    if (ws?.readyState !== Ws.OPEN) return false;
    if (marco.byteLength > MENSAJE_MAXIMO_BYTES) {
      terminar('demasiado-grande');
      return false;
    }
    ws.send(/** @type {Uint8Array<ArrayBuffer>} */ (marco));
    return true;
  };

  /** @param {Uint8Array} u @param {unknown} origen */
  const alCambio = (u, origen) => {
    if (origen === DEL_SERVIDOR) return;
    // Sin conexión, o antes de saber el rol: queda en el Y.Doc y sale en el paso 2 al reconectar.
    if (!ws || rol === null || !escribe(rol)) {
      ponerPendiente(true);
      return;
    }
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.sync);
    encoding.writeVarUint(e, SYNC.actualizacion);
    encoding.writeVarUint8Array(e, u);
    if (!enviar(encoding.toUint8Array(e))) ponerPendiente(true);
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

  const reintentar = () => {
    if (terminado) return;
    o.alEstado('reconectando');
    temporizador = setTimeout(() => {
      temporizador = null;
      void abrir();
    }, espera(intentos++));
  };

  /** Volvió la red: no esperar al temporizador. */
  function alVolverRed() {
    if (terminado || ws || !temporizador) return;
    clearTimeout(temporizador);
    temporizador = null;
    intentos = 0;
    void abrir();
  }
  w.addEventListener('online', alVolverRed);

  /**
   * Paso 1 del servidor: su vector de estado. Se responde con lo que le falta (si se puede escribir).
   * @param {decoding.Decoder} dec
   */
  function alPaso1(dec) {
    const vector = decoding.readVarUint8Array(dec);
    if (!escribe(rol)) {
      // Sin permiso de escritura, lo local no se manda (el servidor lo descartaría). Si había algo, se avisa.
      if (pendiente || adelantado(o.doc, vector)) o.alRechazados?.();
      ponerPendiente(false);
      return;
    }
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.sync);
    encoding.writeVarUint(e, SYNC.paso2);
    encoding.writeVarUint8Array(e, Y.encodeStateAsUpdate(o.doc, vector));
    if (enviar(encoding.toUint8Array(e))) ponerPendiente(false);
  }

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
    const socket = new Ws(url, ['cuaderno.v1', `ticket.${ticket}`]);
    socket.binaryType = 'arraybuffer';
    ws = socket;
    rol = null;
    socket.onopen = () => {
      intentos = 0;
      o.alEstado('conectado');
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MENSAJE.sync);
      encoding.writeVarUint(e, SYNC.paso1);
      encoding.writeVarUint8Array(e, Y.encodeStateVector(o.doc));
      enviar(encoding.toUint8Array(e));
      if (o.presencia.getLocalState() !== null) {
        const p = encoding.createEncoder();
        encoding.writeVarUint(p, MENSAJE.presencia);
        encoding.writeVarUint8Array(p, encodeAwarenessUpdate(o.presencia, [o.doc.clientID]));
        enviar(encoding.toUint8Array(p));
      }
    };
    socket.onmessage = (ev) => {
      if (ws !== socket) return;
      const dec = decoding.createDecoder(new Uint8Array(/** @type {ArrayBuffer} */ (ev.data)));
      const tipo = decoding.readVarUint(dec);
      if (tipo === MENSAJE.sync) {
        const sub = decoding.readVarUint(dec);
        if (sub === SYNC.paso1) alPaso1(dec);
        else Y.applyUpdate(o.doc, decoding.readVarUint8Array(dec), DEL_SERVIDOR);
      } else if (tipo === MENSAJE.presencia) {
        applyAwarenessUpdate(o.presencia, decoding.readVarUint8Array(dec), DEL_SERVIDOR);
      } else if (tipo === MENSAJE.control) {
        const c = /** @type {{ tipo?: string, rol?: string }} */ (JSON.parse(decoding.readVarString(dec)));
        if (c.tipo === 'rol' && c.rol) {
          reintentoPermiso = false;
          rol = c.rol;
          o.alRol?.(c.rol);
        } else if (c.tipo === 'comentarios') {
          o.alComentarios?.();
        } else {
          o.alControl?.(c); // bloque Q: ia.sugerencia
        }
      }
    };
    socket.onclose = (ev) => {
      if (ws !== socket) return;
      ws = null;
      rol = null;
      // Sin conexión no se sabe quién sigue: la presencia ajena se borra y vuelve con la reconexión.
      const ajenos = [...o.presencia.getStates().keys()].filter((id) => id !== o.doc.clientID);
      removeAwarenessStates(o.presencia, ajenos, DEL_SERVIDOR);
      if (terminado) return;
      if (ev.code === 4404) return terminar('borrado');
      if (ev.code === 4400) return terminar('error');
      if (ev.code === 4413 || ev.code === 1009) return terminar('demasiado-grande');
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
    /** ¿Hay cambios locales sin enviar? */
    pendiente: () => pendiente,
    /** Un mensaje de control (JSON) al servidor (bloque Q: ia.autocompletar). false si no hay conexión. */
    enviarControl(/** @type {unknown} */ m) {
      const e = encoding.createEncoder();
      encoding.writeVarUint(e, MENSAJE.control);
      encoding.writeVarString(e, JSON.stringify(m));
      return enviar(encoding.toUint8Array(e));
    },
    /** Cierra a propósito (al salir de la vista): sin reintentos, y la presencia se va. */
    cerrar() {
      terminado = true;
      if (temporizador) clearTimeout(temporizador);
      w.removeEventListener('online', alVolverRed);
      o.presencia.setLocalState(null);
      o.doc.off('update', alCambio);
      o.presencia.off('update', alPresencia);
      ws?.close(1000);
      ws = null;
    },
  };
}
