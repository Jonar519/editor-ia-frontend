// Convergencia con semilla (bloque M): varias réplicas con el código REAL del cliente (documento.js y
// conexion.js), una copia local en memoria con la misma interfaz que la de IndexedDB, y una red simulada
// que intercala las entregas al azar, DUPLICA mensajes, corta conexiones perdiendo lo que iba en camino,
// deja réplicas sin red un rato y las RECARGA desde su copia local. Al final, con todo en línea:
//   - todas las réplicas y el servidor tienen el mismo texto;
//   - cada fragmento insertado y no borrado aparece EXACTAMENTE una vez (sin pérdida ni duplicados), y
//     ninguno borrado reaparece.
// Si falla, el mensaje trae la semilla para reproducirlo.
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../../src/api/errores.js';
import { abrirDocumento } from '../../src/tiempo-real/documento.js';

const DOC = '00000000-0000-4000-8000-0000000000d1';

/** PRNG con semilla (mulberry32): la misma semilla da la misma corrida. */
function azarCon(/** @type {number} */ semilla) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { r, entero: (/** @type {number} */ n) => Math.floor(r() * n), si: (/** @type {number} */ p) => r() < p };
}

/** Un mensaje en camino por un enlace (FIFO por enlace, como un WebSocket). */
/** @typedef {{ datos: Uint8Array, hacia: 'servidor' | 'cliente' }} Marco */

/** La red y el servidor simulados (mismas reglas del backend: rol al entrar, paso 1, retransmitir). */
function red(/** @type {ReturnType<typeof azarCon>} */ azar) {
  const servidorDoc = new Y.Doc();
  const estadisticas = { duplicados: 0, cortes: 0 };
  /** @type {Set<Enlace>} */
  const enlaces = new Set();

  class Enlace {
    static OPEN = 1;
    readyState = 0;
    binaryType = 'arraybuffer';
    /** @type {Marco[]} */
    cola = [];
    /** @type {((ev: unknown) => void) | null} */ onopen = null;
    /** @type {((ev: { data: ArrayBuffer }) => void) | null} */ onmessage = null;
    /** @type {((ev: { code: number }) => void) | null} */ onclose = null;

    constructor() {
      enlaces.add(this);
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.onopen?.({});
        const control = encoding.createEncoder();
        encoding.writeVarUint(control, 2);
        encoding.writeVarString(control, JSON.stringify({ tipo: 'rol', rol: 'editor' }));
        this.aCliente(encoding.toUint8Array(control));
        const paso1 = encoding.createEncoder();
        encoding.writeVarUint(paso1, 0);
        encoding.writeVarUint(paso1, 0);
        encoding.writeVarUint8Array(paso1, Y.encodeStateVector(servidorDoc));
        this.aCliente(encoding.toUint8Array(paso1));
      }, 0);
    }

    /** @param {Uint8Array} datos */
    send(datos) {
      if (this.readyState === 1) this.cola.push({ datos: new Uint8Array(datos), hacia: 'servidor' });
    }

    /** @param {Uint8Array} datos */
    aCliente(datos) {
      this.cola.push({ datos, hacia: 'cliente' });
    }

    /** Se corta: lo que iba en camino se PIERDE. */
    close(codigo = 1006) {
      if (this.readyState === 3) return;
      if (codigo === 1006) estadisticas.cortes++;
      this.readyState = 3;
      this.cola = [];
      enlaces.delete(this);
      // El aviso de cierre llega un poco después (como en un navegador): en medio, el socket ya no envía.
      setTimeout(() => this.onclose?.({ code: codigo }), azar.entero(4));
    }

    /** Entrega el primer mensaje en camino (y a veces lo duplica). */
    entregar() {
      const m = this.cola.shift();
      if (!m) return;
      const repetir = azar.si(0.1);
      if (repetir) estadisticas.duplicados++;
      for (let i = 0; i < (repetir ? 2 : 1); i++) {
        if (m.hacia === 'cliente') this.onmessage?.({ data: m.datos.slice().buffer });
        else this.alServidor(m.datos);
      }
    }

    /** @param {Uint8Array} datos */
    alServidor(datos) {
      const dec = decoding.createDecoder(datos);
      if (decoding.readVarUint(dec) !== 0) return; // presencia: no se prueba aquí
      const sub = decoding.readVarUint(dec);
      if (sub === 0) {
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, 0);
        encoding.writeVarUint(e, 1);
        encoding.writeVarUint8Array(e, Y.encodeStateAsUpdate(servidorDoc, decoding.readVarUint8Array(dec)));
        this.aCliente(encoding.toUint8Array(e));
      } else {
        Y.applyUpdate(servidorDoc, decoding.readVarUint8Array(dec), this);
      }
    }
  }

  servidorDoc.on('update', (/** @type {Uint8Array} */ u, /** @type {unknown} */ origen) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, 0);
    encoding.writeVarUint(e, 2);
    encoding.writeVarUint8Array(e, u);
    const marco = encoding.toUint8Array(e);
    for (const l of enlaces) if (l !== origen && l.readyState === 1) l.aCliente(marco);
  });

  return { servidorDoc, enlaces, Enlace, estadisticas };
}

/** Copia local en memoria con la interfaz de almacen-local.js (persiste entre recargas de la réplica). */
function almacenEnMemoria() {
  /** @type {Uint8Array[]} */
  let filas = [];
  let sinEnviar = 0;
  return {
    filas: () => filas,
    sinEnviar: () => sinEnviar,
    abrir: async () => ({
      cargar: async () => filas.slice(),
      guardar: async (/** @type {Uint8Array} */ u) => {
        filas.push(u);
      },
      reemplazar: async (/** @type {Uint8Array} */ e) => {
        filas = [e];
      },
      borrar: async () => {
        filas = [];
        sinEnviar = 0;
      },
      sinEnviar: async () => sinEnviar,
      marcarSinEnviar: async (/** @type {number} */ n) => {
        sinEnviar = n;
      },
    }),
  };
}

/** Un paso del reloj FALSO: corre los temporizadores vencidos y las promesas (determinista y rápido). */
const pausa = () => vi.advanceTimersByTimeAsync(1);

/**
 * @param {number} semilla
 * @param {{ replicas: number, pasos: number }} o
 */
async function corrida(semilla, o) {
  const azar = azarCon(semilla);
  const r = red(azar);
  /** @type {Set<string>} */
  const insertados = new Set();
  /** @type {Set<string>} */
  const borrados = new Set();
  const estadisticas = Object.assign(r.estadisticas, { recargas: 0, sinRed: 0 });
  /** @type {string[]} */
  const avisos = [];

  const replicas = Array.from({ length: o.replicas }, (_, i) => {
    const almacen = almacenEnMemoria();
    const replica = {
      i,
      almacen,
      sinRed: false,
      contador: 0,
      /** Lo que la vista mostraría como "cambios sin enviar". */
      pendiente: false,
      /** @type {InstanceType<typeof r.Enlace> | null} */
      enlace: null,
      /** @type {Awaited<ReturnType<typeof abrirDocumento>> | null} */
      vivo: null,
      api: {
        solicitar: async () => {
          if (replica.sinRed) throw new ErrorApi({ estado: 0, codigo: 'red', mensaje: 'sin red' });
          return { ticket: 'A'.repeat(43) };
        },
        refrescar: async () => true,
      },
      ventana: /** @type {Window} */ (/** @type {unknown} */ ({ location: { hash: `#/r${String(i)}` }, addEventListener() {}, removeEventListener() {} })),
      async abrir() {
        replica.pendiente = false;
        // El enlace de ESTA réplica (para saber si su conexión está abierta).
        const Propio = class extends r.Enlace {
          constructor() {
            super();
            replica.enlace = this;
          }
        };
        replica.vivo = await abrirDocumento({
          documentoId: DOC,
          alEstado: () => undefined,
          alPendiente: (hay) => {
            replica.pendiente = hay;
          },
          persistir: { usuarioId: 'cuenta-ficticia' },
          ventana: replica.ventana,
          deps: { api: replica.api, abrirAlmacen: almacen.abrir, WebSocket: /** @type {typeof WebSocket} */ (/** @type {unknown} */ (Propio)), espera: () => 0, url: 'ws://simulado' },
        });
      },
    };
    return replica;
  });
  for (const rep of replicas) await rep.abrir();

  for (let paso = 0; paso < o.pasos; paso++) {
    const rep = replicas[azar.entero(replicas.length)];
    if (!rep?.vivo) continue;
    const texto = rep.vivo.texto;
    const tirada = azar.r();
    let cambio = tirada < 0.6;
    if (tirada < 0.45) {
      // Insertar un fragmento único en un borde entre fragmentos.
      const frag = `<${String(rep.i)}.${String(rep.contador++)}>`;
      const actual = texto.toString();
      const bordes = [0, ...[...actual.matchAll(/>/g)].map((m) => (m.index ?? 0) + 1)];
      texto.insert(bordes[azar.entero(bordes.length)] ?? 0, frag);
      insertados.add(frag);
    } else if (tirada < 0.6) {
      // Borrar un fragmento entero de los que ve esta réplica.
      const actual = texto.toString();
      const vistos = [...actual.matchAll(/<\d+\.\d+>/g)];
      const elegido = vistos[azar.entero(vistos.length)];
      if (elegido) {
        texto.delete(elegido.index ?? 0, elegido[0].length);
        borrados.add(elegido[0]);
      } else {
        cambio = false;
      }
    } else if (tirada < 0.85) {
      // Entregar mensajes en camino, de enlaces al azar.
      for (let k = 0; k < 1 + azar.entero(6); k++) {
        const ls = [...r.enlaces];
        ls[azar.entero(ls.length)]?.entregar();
      }
    } else if (tirada < 0.93) {
      // Cortar conexiones al azar (pierden lo que iba en camino) y, a veces, dejar sin red a esta réplica.
      rep.sinRed = azar.si(0.5);
      if (rep.sinRed) estadisticas.sinRed++;
      for (const l of r.enlaces) if (azar.si(0.5)) l.close();
    } else if (tirada < 0.97) {
      rep.sinRed = false;
    } else {
      // Recargar la página: se cierra y vuelve a abrir desde su copia local (lo ya guardado).
      await rep.vivo.guardado();
      rep.vivo.cerrar();
      await rep.abrir();
      estadisticas.recargas++;
    }
    // Un cambio hecho sin una conexión abierta tiene que quedar marcado como "sin enviar" (lo que la vista
    // muestra para decir que no se perdió).
    if (cambio && rep.enlace?.readyState !== 1 && !rep.pendiente) avisos.push(`paso ${String(paso)}: réplica ${String(rep.i)} sin la marca de pendiente`);
    await pausa();
  }

  // Sanar: todo en línea, entregar hasta que no quede nada en camino.
  for (const rep of replicas) rep.sinRed = false;
  let vueltas = 0;
  for (; vueltas < 2000; vueltas++) {
    await pausa();
    const ocupados = [...r.enlaces].filter((l) => l.cola.length > 0);
    for (const l of ocupados) l.entregar();
    const todosConectados = replicas.length === [...r.enlaces].filter((l) => l.readyState === 1).length;
    if (ocupados.length === 0 && todosConectados && vueltas > 5) break;
  }
  if (process.env.CONVERGENCIA_DEBUG) console.log(semilla, { vueltas, enlaces: r.enlaces.size, ...estadisticas });

  for (const rep of replicas) await rep.vivo?.guardado();
  const resultado = {
    final: r.servidorDoc.getText('contenido').toString(),
    textos: replicas.map((rep) => rep.vivo?.texto.toString()),
    sobrevivientes: [...insertados].filter((f) => !borrados.has(f)),
    borrados: [...borrados],
    avisos,
    pendientesAlFinal: replicas.filter((rep) => rep.pendiente || rep.almacen.sinEnviar() > 0).map((rep) => rep.i),
    almacenes: replicas.map((rep) => {
      const d = new Y.Doc();
      for (const u of rep.almacen.filas()) Y.applyUpdate(d, u);
      return d.getText('contenido').toString();
    }),
  };
  for (const rep of replicas) rep.vivo?.cerrar();
  return resultado;
}

const cuenta = (/** @type {string} */ texto, /** @type {string} */ frag) => texto.split(frag).length - 1;

describe('convergencia con semilla (réplicas, órdenes al azar, duplicados, cortes y recargas)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const SEMILLAS = Array.from({ length: 200 }, (_, i) => 1000 + i * 7919);
  it.each(SEMILLAS)('semilla %i', async (semilla) => {
    const r = await corrida(semilla, { replicas: 2 + (semilla % 4), pasos: 250 });
    const contexto = `semilla ${String(semilla)}`;
    for (const t of r.textos) expect(t, contexto).toBe(r.final);
    for (const f of r.sobrevivientes) expect(cuenta(r.final, f), `${contexto}: ${f}`).toBe(1);
    for (const f of r.borrados) expect(cuenta(r.final, f), `${contexto}: ${f} borrado`).toBe(0);
    // Lo guardado en el dispositivo también llegó al mismo estado.
    for (const t of r.almacenes) expect(t, `${contexto}: copia local`).toBe(r.final);
    // "Cambios sin enviar" dice la verdad: encendido sin conexión, apagado cuando todo llegó.
    expect(r.avisos, contexto).toEqual([]);
    expect(r.pendientesAlFinal, contexto).toEqual([]);
  });
});
