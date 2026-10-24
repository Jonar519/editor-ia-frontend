// Apoyo de las pruebas de colaboración (bloques L, M y N). El API y el WebSocket son SIMULADOS: un relevo
// hace de servidor (sincronía de Yjs, presencia con el nombre de la cuenta y el rol al entrar, como el
// backend; ADR 0002), y almacenes en memoria hacen de las rutas de comentarios y versiones con las mismas
// formas y permisos que el backend. Datos SOLO ficticios (@example.com, nombres inventados).
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { readSyncMessage, writeSyncStep1 } from 'y-protocols/sync';
import * as Y from 'yjs';
import { cuerpoError, expect } from './fixtures.mjs';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Route} Route */
/** @typedef {import('@playwright/test').WebSocketRoute} WebSocketRoute */
/** @typedef {{ id: string, nombre: string, correo: string, rol: 'editor' | 'lector' }} Cuenta */
/** @typedef {'propietario' | 'editor' | 'lector'} RolDocumento */

export const DOC = '00000000-0000-4000-8000-0000000000d1';
export const ANA = /** @type {Cuenta} */ ({ id: '00000000-0000-4000-8000-0000000000a1', nombre: 'Ana Ficticia', correo: 'ana@example.com', rol: 'editor' });
export const BETO = /** @type {Cuenta} */ ({ id: '00000000-0000-4000-8000-0000000000b2', nombre: 'Beto Inventado', correo: 'beto@example.com', rol: 'editor' });
export const LUCIA = /** @type {Cuenta} */ ({ id: '00000000-0000-4000-8000-0000000000c3', nombre: 'Lucía Imaginaria', correo: 'lucia@example.com', rol: 'lector' });
const MENSAJE = { sync: 0, presencia: 1, control: 2 };

export const json = (/** @type {Route} */ r, /** @type {unknown} */ cuerpo, estado = 200) =>
  r.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify(cuerpo) });

/** El servidor de la prueba: un Y.Doc y una presencia, y quién está conectado. */
export function relevo() {
  const doc = new Y.Doc();
  const presencia = new Awareness(doc);
  presencia.setLocalState(null);
  /** @type {Set<WebSocketRoute>} */
  const conexiones = new Set();
  const aTodos = (/** @type {Uint8Array} */ marco, /** @type {unknown} */ salvo) => {
    for (const ws of conexiones) if (ws !== salvo) ws.send(Buffer.from(marco));
  };
  doc.on('update', (/** @type {Uint8Array} */ u, /** @type {unknown} */ origen) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.sync);
    encoding.writeVarUint(e, 2);
    encoding.writeVarUint8Array(e, u);
    aTodos(encoding.toUint8Array(e), origen);
  });
  presencia.on('update', (/** @type {{ added: number[], updated: number[], removed: number[] }} */ c, /** @type {unknown} */ origen) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.presencia);
    encoding.writeVarUint8Array(e, encodeAwarenessUpdate(presencia, [...c.added, ...c.updated, ...c.removed]));
    aTodos(encoding.toUint8Array(e), origen);
  });
  const control = (/** @type {unknown} */ o) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.control);
    encoding.writeVarString(e, JSON.stringify(o));
    return encoding.toUint8Array(e);
  };
  // Bloque Q: los mensajes de control que manda el cliente (ia.autocompletar), y quién los contesta.
  /** @type {Record<string, unknown>[]} */
  const controles = [];
  /** @type {{ alControl: ((m: Record<string, unknown>, responder: (r: unknown) => void) => void) | null }} */
  const atencion = { alControl: null };

  /** @param {WebSocketRoute} ws @param {Cuenta} cuenta @param {RolDocumento} rol */
  function conectar(ws, cuenta, rol) {
    conexiones.add(ws);
    ws.send(Buffer.from(control({ tipo: 'rol', rol })));
    const paso1 = encoding.createEncoder();
    encoding.writeVarUint(paso1, MENSAJE.sync);
    writeSyncStep1(paso1, doc);
    ws.send(Buffer.from(encoding.toUint8Array(paso1)));
    const ids = [...presencia.getStates().keys()];
    if (ids.length > 0) {
      const p = encoding.createEncoder();
      encoding.writeVarUint(p, MENSAJE.presencia);
      encoding.writeVarUint8Array(p, encodeAwarenessUpdate(presencia, ids));
      ws.send(Buffer.from(encoding.toUint8Array(p)));
    }
    ws.onMessage((m) => {
      const dec = decoding.createDecoder(new Uint8Array(/** @type {Buffer} */ (m)));
      const tipo = decoding.readVarUint(dec);
      if (tipo === MENSAJE.sync) {
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, MENSAJE.sync);
        readSyncMessage(dec, e, doc, ws);
        if (encoding.length(e) > 1) ws.send(Buffer.from(encoding.toUint8Array(e)));
      } else if (tipo === MENSAJE.presencia) {
        // Como el backend: la cuenta y el nombre los pone el servidor.
        const entrada = decoding.createDecoder(decoding.readVarUint8Array(dec));
        const salida = encoding.createEncoder();
        const n = decoding.readVarUint(entrada);
        encoding.writeVarUint(salida, n);
        for (let i = 0; i < n; i++) {
          encoding.writeVarUint(salida, decoding.readVarUint(entrada));
          encoding.writeVarUint(salida, decoding.readVarUint(entrada));
          const estado = JSON.parse(decoding.readVarString(entrada));
          encoding.writeVarString(salida, JSON.stringify(estado === null ? null : { ...estado, usuario: { id: cuenta.id, nombre: cuenta.nombre }, user: { ...estado.user, name: cuenta.nombre } }));
        }
        applyAwarenessUpdate(presencia, encoding.toUint8Array(salida), ws);
      } else if (tipo === MENSAJE.control) {
        const m = JSON.parse(decoding.readVarString(dec));
        controles.push(m);
        atencion.alControl?.(m, (r) => ws.send(Buffer.from(control(r))));
      }
    });
    ws.onClose(() => conexiones.delete(ws));
  }
  return {
    doc,
    conexiones,
    conectar,
    /** Como el backend al cambiar los comentarios: aviso de control a todas las conexiones. */
    avisarComentarios: () => aTodos(control({ tipo: 'comentarios' }), null),
    /** Los mensajes de control recibidos de los clientes, en orden. */
    controles,
    /** Quién contesta los mensajes de control (en la prueba, el autocompletado de la IA). */
    atencion,
  };
}

/** @typedef {ReturnType<typeof relevo>} Relevo */

/**
 * Una persona con sesión abierta en una vista del documento.
 * @param {Page} page @param {Cuenta} cuenta @param {Relevo} servidor
 * @param {{ vista?: 'editar' | 'leer' | 'versiones', rol?: RolDocumento, conexion?: { sinRed: boolean } }} [o]
 *   conexion.sinRed: el ticket falla como sin red
 */
export async function abrirDocumento(page, cuenta, servidor, o = {}) {
  const rol = o.rol ?? 'editor';
  const conexion = o.conexion ?? { sinRed: false };
  await page.route('**/api/auth/refresco', (r) => json(r, { accessToken: `token-ficticio-${cuenta.nombre}`, expiraEn: Math.floor(Date.now() / 1000) + 900, usuario: cuenta }));
  await page.route(`**/api/documentos/${DOC}`, (r) =>
    json(r, { id: DOC, espacioId: '00000000-0000-4000-8000-0000000000e1', titulo: 'Guía de prueba', rol, propietario: { id: ANA.id, nombre: ANA.nombre }, creadoEn: '2026-01-15T12:00:00.000Z', actualizadoEn: '2026-01-15T12:00:00.000Z' }),
  );
  /** @type {unknown[]} */
  const tickets = [];
  await page.route('**/api/tiempo-real/tickets', (r) => {
    if (conexion.sinRed) return r.abort('internetdisconnected');
    tickets.push(r.request().postDataJSON());
    return json(r, { ticket: 'A'.repeat(43), expiraEnSegundos: 30 }, 201);
  });
  /** @type {WebSocketRoute[]} */
  const sockets = [];
  await page.routeWebSocket('**/api/tiempo-real', (ws) => {
    sockets.push(ws);
    servidor.conectar(ws, cuenta, rol);
  });
  const vista = o.vista ?? 'editar';
  await page.goto(`/#/documentos/${DOC}${vista === 'leer' ? '' : `/${vista}`}`);
  if (vista !== 'versiones') await expect(red(page)).toContainText('Conectado');
  return {
    tickets,
    sockets,
    editor: page.getByRole('textbox', { name: 'Contenido de Guía de prueba' }),
  };
}

/** Una persona en el editor (bloques L y M). */
export const abrirEditor = (/** @type {Page} */ page, /** @type {Cuenta} */ cuenta, /** @type {Relevo} */ servidor, conexion = { sinRed: false }) =>
  abrirDocumento(page, cuenta, servidor, { conexion });

/** El indicador de conexión. */
export const red = (/** @type {Page} */ page) => page.getByRole('status').filter({ hasText: 'Conexión:' });

/** El texto del editor, sin los cursores remotos (que llevan el nombre como texto dentro de la línea). */
export const texto = (/** @type {Page} */ page) =>
  page.locator('.cm-content').evaluate((el) => {
    const copia = /** @type {HTMLElement} */ (el.cloneNode(true));
    for (const c of copia.querySelectorAll('.cm-ySelectionCaret')) c.remove();
    return [...copia.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n');
  });

/**
 * La segunda persona, en su propio contexto (otra cookie, otra sesión) y con el API cerrado por defecto.
 * @param {import('@playwright/test').Browser} browser @param {string | undefined} baseURL @param {'light' | 'dark'} colorScheme
 */
export async function segundaPersona(browser, baseURL, colorScheme) {
  const contexto = await browser.newContext({ baseURL, locale: 'es-MX', timezoneId: 'UTC', colorScheme, serviceWorkers: 'block' });
  const pagina = await contexto.newPage();
  await pagina.route('**/api/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: cuerpoError('sin_refresco', 'Inicia sesión de nuevo') }));
  return { contexto, pagina };
}

/**
 * Comentarios simulados, compartidos entre las páginas: mismas formas y permisos que el backend, y el aviso
 * por el relevo en cada cambio.
 * @param {Relevo} servidor
 */
export function comentariosSimulados(servidor) {
  /** @type {{ id: string, padreId: string | null, autor: { id: string, nombre: string }, ancla: string | null, cuerpo: string, resuelto: boolean, creadoEn: string, editadoEn: string | null }[]} */
  const lista = [];
  let n = 0;
  /** @type {{ metodo: string, cuerpo: any }[]} */
  const pedidos = [];
  /** @param {Page} page @param {Cuenta} cuenta @param {RolDocumento} rol */
  async function registrar(page, cuenta, rol) {
    await page.route(`**/api/documentos/${DOC}/comentarios`, (r) => {
      const req = r.request();
      if (req.method() === 'GET') return json(r, { comentarios: lista });
      const c = req.postDataJSON();
      pedidos.push({ metodo: 'POST', cuerpo: c });
      const nuevo = {
        id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
        padreId: c.padreId ?? null,
        autor: { id: cuenta.id, nombre: cuenta.nombre },
        ancla: c.ancla ?? null,
        cuerpo: c.cuerpo,
        resuelto: false,
        creadoEn: new Date(Date.UTC(2026, 0, 15, 12, n)).toISOString(),
        editadoEn: null,
      };
      lista.push(nuevo);
      servidor.avisarComentarios();
      return json(r, nuevo, 201);
    });
    await page.route('**/api/comentarios/*', (r) => {
      const req = r.request();
      const id = req.url().split('/').at(-1) ?? '';
      const c = lista.find((x) => x.id === id);
      if (!c) return json(r, JSON.parse(cuerpoError('comentario_no_encontrado', 'No existe')), 404);
      if (req.method() === 'DELETE') {
        if (c.autor.id !== cuenta.id && rol !== 'propietario') return json(r, JSON.parse(cuerpoError('sin_permiso', 'No')), 403);
        for (let i = lista.length - 1; i >= 0; i--) if (lista[i]?.id === id || lista[i]?.padreId === id) lista.splice(i, 1);
        servidor.avisarComentarios();
        return r.fulfill({ status: 204 });
      }
      const cambio = req.postDataJSON();
      pedidos.push({ metodo: 'PATCH', cuerpo: cambio });
      if (cambio.cuerpo !== undefined) {
        if (c.autor.id !== cuenta.id) return json(r, JSON.parse(cuerpoError('sin_permiso', 'No')), 403);
        c.cuerpo = cambio.cuerpo;
        c.editadoEn = new Date(Date.UTC(2026, 0, 16)).toISOString();
      }
      if (cambio.resuelto !== undefined) {
        if (c.autor.id !== cuenta.id && rol === 'lector') return json(r, JSON.parse(cuerpoError('sin_permiso', 'No')), 403);
        c.resuelto = cambio.resuelto;
      }
      servidor.avisarComentarios();
      return json(r, c);
    });
  }
  return { lista, pedidos, registrar };
}

/**
 * Versiones simuladas sobre el texto del relevo: guardar, listar, ver y restaurar (como cambio nuevo en el
 * documento vivo, que llega a quien lo tiene abierto).
 * @param {Relevo} servidor
 */
export function versionesSimuladas(servidor) {
  /** @type {{ numero: number, motivo: string, autor: { id: string, nombre: string } | null, restauradaDe: number | null, creadaEn: string, caracteres: number, texto: string }[]} */
  const versiones = [];
  const textoVivo = () => servidor.doc.getText('contenido').toString();
  const sinTexto = (/** @type {(typeof versiones)[number]} */ v) => ({ ...v, texto: undefined });
  /** @param {Page} page @param {Cuenta} cuenta */
  async function registrar(page, cuenta) {
    const agregar = (/** @type {string} */ motivo, /** @type {number | null} */ restauradaDe) => {
      const t = textoVivo();
      const v = { numero: versiones.length + 1, motivo, autor: { id: cuenta.id, nombre: cuenta.nombre }, restauradaDe, creadaEn: new Date(Date.UTC(2026, 0, 15, 13, versiones.length)).toISOString(), caracteres: t.length, texto: t };
      versiones.push(v);
      return v;
    };
    await page.route(`**/api/documentos/${DOC}/texto`, (r) => json(r, { texto: textoVivo() }));
    await page.route(`**/api/documentos/${DOC}/versiones`, (r) => {
      if (r.request().method() === 'GET') return json(r, { versiones: [...versiones].reverse().map(sinTexto) });
      return json(r, sinTexto(agregar('manual', null)), 201);
    });
    await page.route(new RegExp(`/api/documentos/${DOC}/versiones/(\\d+)(/restaurar)?$`), (r) => {
      const m = /versiones\/(\d+)(\/restaurar)?$/.exec(r.request().url());
      const v = versiones.find((x) => x.numero === Number(m?.[1]));
      if (!v) return json(r, JSON.parse(cuerpoError('version_no_encontrada', 'No existe')), 404);
      if (!m?.[2]) return json(r, v);
      // Restaurar: un cambio nuevo en el documento vivo (lo reciben todas las conexiones).
      const t = servidor.doc.getText('contenido');
      Y.transact(servidor.doc, () => {
        t.delete(0, t.length);
        t.insert(0, v.texto);
      }, 'servidor');
      return json(r, sinTexto(agregar('restauracion', v.numero)), 201);
    });
  }
  return { versiones, registrar };
}
