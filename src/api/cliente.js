// Cliente del API. Reglas (ADR 0001 del backend):
//   - El access token vive SOLO en memoria (esta clausura). Nunca en localStorage, sessionStorage,
//     IndexedDB ni cookies accesibles por JavaScript. Recargar la página lo pierde a propósito: se pide
//     otro con la cookie de refresco (httpOnly, SameSite=Strict, Path=/api/auth), que JS no puede leer.
//   - UN solo refresco a la vez: dos refrescos simultáneos con la misma cookie cuentan como reutilización
//     y el backend revoca la sesión. Dentro de la pestaña, una promesa compartida; entre pestañas, un
//     cerrojo de Web Locks ("cuaderno-refresco").
//   - Un 401 "no_autenticado" refresca y reintenta UNA vez. Si el refresco falla, la sesión se olvida.
//   - Se refresca antes de que venza (30 s de margen) para no gastar una petición en un 401.
import { ErrorApi } from './errores.js';

/** Margen para refrescar antes de que venza el access token. */
export const MARGEN_REFRESCO_MS = 30_000;
/** Tiempo máximo de cada petición. */
export const TIEMPO_MAXIMO_MS = 15_000;
export const CERROJO_REFRESCO = 'cuaderno-refresco';

/**
 * @typedef {{ id: string, nombre: string, correo: string, rol: 'admin' | 'editor' | 'lector' }} Usuario
 * @typedef {{ accessToken: string, expiraEn: number, usuario: Usuario }} SesionRespuesta
 * @typedef {{ metodo?: string, cuerpo?: unknown, binario?: Blob, comoArchivo?: boolean, senal?: AbortSignal, sinSesion?: boolean }} OpcionesSolicitud
 *   cuerpo: se manda como JSON. binario: se manda TAL CUAL con su tipo (el avatar). comoArchivo: la
 *   respuesta se devuelve como Archivo (blob y nombre del Content-Disposition), no como JSON.
 * @typedef {{ blob: Blob, nombre: string | null }} Archivo
 * @typedef {{ request: (nombre: string, fn: () => Promise<unknown>) => Promise<unknown> }} Cerrojos
 */

/**
 * Nombre de archivo de un Content-Disposition ("attachment; filename=\"x.json\""). Solo un nombre simple:
 * sin rutas ni caracteres de control (el navegador igual lo limpia, pero no se confía en eso).
 * @param {string | null} cabecera
 */
export function nombreDeArchivo(cabecera) {
  const m = /filename="([^"/\\]+)"/.exec(cabecera ?? '');
  const nombre = m?.[1];
  return nombre && /^[\w.-]{1,100}$/.test(nombre) && !nombre.startsWith('.') ? nombre : null;
}

/**
 * @param {{ fetch?: typeof fetch, base?: string, ahora?: () => number, cerrojos?: Cerrojos | null, tiempoMaximoMs?: number }} [o]
 */
export function crearClienteApi(o = {}) {
  const pedir = o.fetch ?? globalThis.fetch.bind(globalThis);
  const base = o.base ?? '/api';
  const ahora = o.ahora ?? (() => Date.now());
  const cerrojos = o.cerrojos === undefined ? (globalThis.navigator?.locks ?? null) : o.cerrojos;
  const tiempoMaximo = o.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS;

  /** @type {string | null} */
  let acceso = null;
  let venceMs = 0;
  /** @type {Usuario | null} */
  let usuario = null;
  /** @type {Promise<boolean> | null} */
  let refrescoEnCurso = null;
  /** @type {Set<(u: Usuario | null) => void>} */
  const oyentes = new Set();

  const avisar = () => {
    for (const f of oyentes) f(usuario);
  };

  /**
   * Guarda el access token (en memoria) y la cuenta. Avisa solo si cambió QUIÉN o con qué ROL: renovar
   * el token cada 15 min no debe redibujar la vista.
   * @param {SesionRespuesta} r
   */
  function establecerSesion(r) {
    const cambio = usuario?.id !== r.usuario.id || usuario.rol !== r.usuario.rol;
    acceso = r.accessToken;
    venceMs = r.expiraEn * 1000;
    usuario = r.usuario;
    if (cambio) avisar();
  }

  function olvidarSesion() {
    const habia = acceso !== null || usuario !== null;
    acceso = null;
    venceMs = 0;
    usuario = null;
    if (habia) avisar();
  }

  /**
   * fetch con tiempo máximo y errores de red con código estable.
   * @param {string} ruta
   * @param {RequestInit} init
   * @param {AbortSignal | undefined} senal
   */
  async function enviar(ruta, init, senal) {
    const limite = AbortSignal.timeout(tiempoMaximo);
    const senales = senal ? AbortSignal.any([senal, limite]) : limite;
    try {
      return await pedir(`${base}${ruta}`, { ...init, credentials: 'same-origin', cache: 'no-store', signal: senales });
    } catch (err) {
      if (senal?.aborted) throw err; // la canceló quien la pidió (por ejemplo, al cambiar de vista)
      if (limite.aborted) throw new ErrorApi({ estado: 0, codigo: 'tiempo_agotado', mensaje: 'El servidor tardó demasiado en responder.' });
      throw new ErrorApi({ estado: 0, codigo: 'red', mensaje: 'No hay conexión con el servidor.' });
    }
  }

  /** @param {Response} r */
  async function errorDe(r) {
    /** @type {{ error?: { codigo?: string, mensaje?: string, solicitud?: string, detalles?: unknown } }} */
    let cuerpo = {};
    try {
      cuerpo = await r.json();
    } catch {
      // cuerpo no JSON (por ejemplo, un proxy caído)
    }
    const espera = Number(r.headers.get('retry-after'));
    return new ErrorApi({
      estado: r.status,
      codigo: cuerpo.error?.codigo ?? `http_${String(r.status)}`,
      mensaje: cuerpo.error?.mensaje ?? 'Error del servidor',
      solicitud: cuerpo.error?.solicitud,
      detalles: cuerpo.error?.detalles,
      reintentarEnSegundos: Number.isFinite(espera) && espera > 0 ? espera : undefined,
    });
  }

  /**
   * Pide un access token nuevo con la cookie de refresco. Una sola vez a la vez (en la pestaña y entre
   * pestañas). Devuelve true si hay sesión.
   * @returns {Promise<boolean>}
   */
  function refrescar() {
    if (refrescoEnCurso) return refrescoEnCurso;
    const hacer = async () => {
      const r = await enviar('/auth/refresco', { method: 'POST', headers: { accept: 'application/json' } }, undefined);
      if (r.ok) {
        establecerSesion(/** @type {SesionRespuesta} */ (await r.json()));
        return true;
      }
      olvidarSesion();
      return false;
    };
    refrescoEnCurso = (async () => {
      try {
        return cerrojos ? /** @type {boolean} */ (await cerrojos.request(CERROJO_REFRESCO, hacer)) : await hacer();
      } catch (err) {
        // Sin red no se sabe si la sesión sigue: se conserva lo que había y se informa que no se pudo.
        if (err instanceof ErrorApi && (err.codigo === 'red' || err.codigo === 'tiempo_agotado')) return false;
        throw err;
      } finally {
        refrescoEnCurso = null;
      }
    })();
    return refrescoEnCurso;
  }

  /**
   * @param {string} ruta ruta bajo /api, por ejemplo "/cuenta"
   * @param {OpcionesSolicitud} [op]
   * @returns {Promise<any>}
   */
  async function solicitar(ruta, op = {}) {
    const conSesion = !op.sinSesion;
    if (conSesion && acceso && venceMs - ahora() < MARGEN_REFRESCO_MS) await refrescar();

    /** @param {boolean} reintentar */
    const intento = async (reintentar) => {
      /** @type {Record<string, string>} */
      const cabeceras = { accept: op.comoArchivo ? '*/*' : 'application/json' };
      /** @type {BodyInit | undefined} */
      let cuerpo;
      if (op.binario) {
        cabeceras['content-type'] = op.binario.type;
        cuerpo = op.binario;
      } else if (op.cuerpo !== undefined) {
        cabeceras['content-type'] = 'application/json';
        cuerpo = JSON.stringify(op.cuerpo);
      }
      if (conSesion && acceso) cabeceras.authorization = `Bearer ${acceso}`;
      const r = await enviar(ruta, { method: op.metodo ?? 'GET', headers: cabeceras, body: cuerpo }, op.senal);
      if (r.status === 401 && conSesion && reintentar) {
        const err = await errorDe(r);
        if (err.codigo !== 'no_autenticado') throw err;
        if (await refrescar()) return intento(false);
        olvidarSesion();
        throw err;
      }
      if (r.status === 204) return undefined;
      if (!r.ok) {
        const err = await errorDe(r);
        if (r.status === 401 && conSesion) olvidarSesion();
        throw err;
      }
      if (op.comoArchivo) return /** @type {Archivo} */ ({ blob: await r.blob(), nombre: nombreDeArchivo(r.headers.get('content-disposition')) });
      return r.json();
    };
    return intento(true);
  }

  return {
    solicitar,
    refrescar,
    establecerSesion,
    olvidarSesion,
    /** La cuenta de la sesión (sin el token, que nunca sale de aquí). */
    usuario: () => usuario,
    /** @param {(u: Usuario | null) => void} f */
    suscribir: (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
  };
}
