// Cliente del API con un fetch FALSO que registra cada llamada: token en memoria, un solo refresco a la
// vez (en la pestaña y con Web Locks), un reintento tras refrescar, errores normalizados.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CERROJO_REFRESCO, crearClienteApi, nombreDeArchivo } from '../../src/api/cliente.js';
import { ErrorApi, mensajeParaPersona } from '../../src/api/errores.js';

const AHORA = 1_800_000_000_000;
const USUARIO = { id: 'u1', nombre: 'Persona Ficticia', correo: 'ana@example.com', rol: /** @type {const} */ ('lector') };

/** @param {string} token @param {number} [vence] segundos Unix */
const sesion = (token, vence = AHORA / 1000 + 900) => ({ accessToken: token, expiraEn: vence, usuario: USUARIO });

/**
 * @param {unknown} cuerpo
 * @param {number} [estado]
 * @param {Record<string, string>} [cabeceras]
 */
const resp = (cuerpo, estado = 200, cabeceras = {}) =>
  new Response(estado === 204 ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json', ...cabeceras } });
const error = (/** @type {number} */ estado, /** @type {string} */ codigo, /** @type {Record<string, string>} */ cab = {}) =>
  resp({ error: { codigo, mensaje: `mensaje de ${codigo}`, solicitud: 'sol-1' } }, estado, cab);

/**
 * fetch falso: `responder(url, init, n)` decide la respuesta. Registra url, método y cabeceras.
 * @param {(url: string, init: RequestInit, n: number) => Response | Promise<Response>} responder
 */
function falso(responder) {
  /** @type {{ url: string, metodo: string, cabeceras: Record<string, string>, cuerpo: unknown, init: RequestInit }[]} */
  const llamadas = [];
  /** @type {typeof fetch} */
  const f = async (entrada, init = {}) => {
    const url = String(entrada);
    llamadas.push({ url, metodo: init.method ?? 'GET', cabeceras: /** @type {Record<string, string>} */ (init.headers ?? {}), cuerpo: init.body, init });
    return responder(url, init, llamadas.length);
  };
  return { f, llamadas, refrescos: () => llamadas.filter((l) => l.url.endsWith('/auth/refresco')).length };
}

const nuevo = (/** @type {typeof fetch} */ f, extra = {}) => crearClienteApi({ fetch: f, ahora: () => AHORA, cerrojos: null, ...extra });

describe('token solo en memoria y cabeceras', () => {
  it('con sesión manda Authorization; sinSesion no; siempre same-origin y no-store; cuerpo JSON', async () => {
    const { f, llamadas } = falso(() => resp({ ok: true }));
    const api = nuevo(f);
    api.establecerSesion(sesion('tok-A'));
    await api.solicitar('/cuenta');
    await api.solicitar('/invitaciones/consultar', { metodo: 'POST', cuerpo: { token: 't' }, sinSesion: true });
    expect(llamadas[0]?.cabeceras.authorization).toBe('Bearer tok-A');
    expect(llamadas[1]?.cabeceras.authorization).toBeUndefined();
    expect(llamadas[1]?.cabeceras['content-type']).toBe('application/json');
    expect(llamadas[1]?.cuerpo).toBe('{"token":"t"}');
    for (const l of llamadas) expect([l.init.credentials, l.init.cache]).toEqual(['same-origin', 'no-store']);
  });

  it('el token no se expone: usuario() devuelve la cuenta, nunca el token', () => {
    const api = nuevo(falso(() => resp({})).f);
    api.establecerSesion(sesion('tok-secreto'));
    expect(JSON.stringify(api.usuario())).not.toContain('tok-secreto');
    expect(/** @type {unknown[]} */ (Object.values(api)).includes('tok-secreto')).toBe(false);
  });

  // Bloque M: la copia local de los documentos usa IndexedDB, y SOLO en estos dos archivos, que no tocan la
  // sesión. localStorage, sessionStorage y document.cookie siguen prohibidos en todo el código.
  const COPIA_LOCAL = ['almacen-local.js', 'borrar-local.js'];

  it('ningún archivo del código del navegador usa localStorage, sessionStorage ni document.cookie; IndexedDB solo la copia local', () => {
    const raiz = path.join(import.meta.dirname, '../../src');
    const archivos = readdirSync(raiz, { recursive: true, withFileTypes: true }).filter((x) => x.isFile() && x.name.endsWith('.js'));
    expect(archivos.length).toBeGreaterThan(10); // control: de verdad se revisan archivos
    for (const a of archivos) {
      // Sin comentarios: el comentario de cliente.js explica justamente por qué NO se usan.
      const codigo = readFileSync(path.join(a.parentPath, a.name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(codigo, a.name).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
      if (COPIA_LOCAL.includes(a.name)) {
        // La copia local nunca ve la sesión: no importa el cliente del API ni la sesión, ni habla de tokens.
        expect(codigo, a.name).not.toMatch(/sesion\.js|api\/cliente\.js|token|accessToken|refresco/i);
      } else {
        expect(codigo, a.name).not.toMatch(/indexedDB/);
      }
    }
  });
});

describe('cuerpo binario y respuesta como archivo (avatar y exportación)', () => {
  it('binario: el blob va TAL CUAL con su tipo (no como JSON) y con el token', async () => {
    const { f, llamadas } = falso(() => resp({ ancho: 1, alto: 1 }));
    const api = nuevo(f);
    api.establecerSesion(sesion('tok-A'));
    const imagen = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    await api.solicitar('/cuenta/avatar', { metodo: 'PUT', binario: imagen });
    expect(llamadas[0]?.cuerpo).toBe(imagen);
    expect(llamadas[0]?.cabeceras['content-type']).toBe('image/png');
    expect(llamadas[0]?.cabeceras.authorization).toBe('Bearer tok-A');
  });

  it('comoArchivo: devuelve el blob y el nombre del Content-Disposition', async () => {
    const { f, llamadas } = falso(() => resp({ formato: 'x' }, 200, { 'content-disposition': 'attachment; filename="cuaderno-datos-2026-10-17.json"' }));
    const api = nuevo(f);
    api.establecerSesion(sesion('tok-A'));
    const a = await api.solicitar('/cuenta/exportacion', { metodo: 'POST', cuerpo: { contrasena: 'x' }, comoArchivo: true });
    expect(a.nombre).toBe('cuaderno-datos-2026-10-17.json');
    expect(await a.blob.text()).toBe('{"formato":"x"}');
    expect(llamadas[0]?.cabeceras.accept).toBe('*/*');
  });

  it('comoArchivo con error: se normaliza igual que siempre (no devuelve el cuerpo del error como archivo)', async () => {
    const api = nuevo(falso(() => error(403, 'contrasena_incorrecta')).f);
    api.establecerSesion(sesion('tok-A'));
    await expect(api.solicitar('/cuenta/exportacion', { metodo: 'POST', cuerpo: { contrasena: 'x' }, comoArchivo: true })).rejects.toMatchObject({ codigo: 'contrasena_incorrecta' });
  });

  it('nombre de archivo: solo un nombre simple; nunca una ruta, oculto o con caracteres raros', () => {
    expect(nombreDeArchivo('attachment; filename="datos.json"')).toBe('datos.json');
    for (const malo of ['attachment; filename="../x.json"', 'attachment; filename="a/b.json"', 'attachment; filename="a\\b.json"', 'attachment; filename=".bashrc"', 'attachment; filename="a b.json"', 'attachment', '', null]) {
      expect(nombreDeArchivo(malo)).toBeNull();
    }
  });
});

describe('refresco', () => {
  it('401 no_autenticado: refresca y reintenta UNA vez con el token nuevo', async () => {
    const { f, llamadas } = falso((url, init) => {
      if (url.endsWith('/auth/refresco')) return resp(sesion('tok-B'));
      const h = /** @type {Record<string, string>} */ (init.headers);
      return h.authorization === 'Bearer tok-B' ? resp({ nombre: 'Ana' }) : error(401, 'no_autenticado');
    });
    const api = nuevo(f);
    api.establecerSesion(sesion('tok-A'));
    await expect(api.solicitar('/cuenta')).resolves.toEqual({ nombre: 'Ana' });
    expect(llamadas.map((l) => l.url)).toEqual(['/api/cuenta', '/api/auth/refresco', '/api/cuenta']);
  });

  it('si después de refrescar vuelve a dar 401, NO hay bucle: se olvida la sesión y se informa', async () => {
    // El refresco "funciona" solo 3 veces: si hubiera bucle, terminaría ahí (y no colgaría la prueba).
    let n = 0;
    const { f, refrescos } = falso((url) => (url.endsWith('/auth/refresco') ? (++n <= 3 ? resp(sesion('tok-B')) : error(401, 'refresco_invalido')) : error(401, 'no_autenticado')));
    const api = nuevo(f);
    api.establecerSesion(sesion('tok-A'));
    await expect(api.solicitar('/cuenta')).rejects.toMatchObject({ codigo: 'no_autenticado' });
    expect(refrescos()).toBe(1);
    expect(api.usuario()).toBeNull();
  });

  it('refresco rechazado (la cookie ya no sirve): se olvida la sesión y avisa a los suscriptores', async () => {
    const { f } = falso((url) => (url.endsWith('/auth/refresco') ? error(401, 'refresco_reutilizado') : error(401, 'no_autenticado')));
    const api = nuevo(f);
    api.establecerSesion(sesion('tok-A'));
    /** @type {unknown[]} */
    const avisos = [];
    api.suscribir((u) => avisos.push(u));
    await expect(api.solicitar('/cuenta')).rejects.toBeInstanceOf(ErrorApi);
    expect(avisos).toEqual([null]);
  });

  it('refrescar() directo (al abrir la página) con la cookie rechazada: sin sesión', async () => {
    const api = nuevo(falso(() => error(401, 'refresco_invalido')).f);
    api.establecerSesion(sesion('tok-viejo'));
    await expect(api.refrescar()).resolves.toBe(false);
    expect(api.usuario()).toBeNull();
  });

  it('refrescar() sin red: no hay forma de saber; conserva lo que había y responde false', async () => {
    const api = nuevo(falso(() => Promise.reject(new TypeError('Failed to fetch'))).f);
    api.establecerSesion(sesion('tok-A'));
    await expect(api.refrescar()).resolves.toBe(false);
    expect(api.usuario()).toEqual(USUARIO);
  });

  it('UN solo refresco aunque tres peticiones reciban 401 a la vez', async () => {
    let soltar = () => {};
    const espera = new Promise((r) => {
      soltar = () => r(undefined);
    });
    const { f, refrescos } = falso(async (url, init) => {
      if (url.endsWith('/auth/refresco')) {
        await espera; // el refresco tarda: las tres peticiones lo esperan juntas
        return resp(sesion('tok-B'));
      }
      const h = /** @type {Record<string, string>} */ (init.headers);
      return h.authorization === 'Bearer tok-B' ? resp({ ok: 1 }) : error(401, 'no_autenticado');
    });
    const api = nuevo(f);
    api.establecerSesion(sesion('tok-A'));
    const tres = Promise.all([api.solicitar('/a'), api.solicitar('/b'), api.solicitar('/c')]);
    await new Promise((r) => setTimeout(r, 10));
    soltar();
    await expect(tres).resolves.toEqual([{ ok: 1 }, { ok: 1 }, { ok: 1 }]);
    expect(refrescos()).toBe(1);
  });

  it('se refresca ANTES de que venza (menos de 30 s) para no gastar una petición en un 401', async () => {
    const { f, llamadas } = falso((url) => (url.endsWith('/auth/refresco') ? resp(sesion('tok-B')) : resp({ ok: 1 })));
    const api = nuevo(f);
    api.establecerSesion(sesion('tok-A', AHORA / 1000 + 20));
    await api.solicitar('/cuenta');
    expect(llamadas.map((l) => l.url)).toEqual(['/api/auth/refresco', '/api/cuenta']);
    expect(llamadas[1]?.cabeceras.authorization).toBe('Bearer tok-B');
  });

  it('entre pestañas: el refresco va dentro del cerrojo de Web Locks "cuaderno-refresco"', async () => {
    /** @type {string[]} */
    const pedidos = [];
    const cerrojos = { request: async (/** @type {string} */ n, /** @type {() => Promise<unknown>} */ fn) => (pedidos.push(n), fn()) };
    const { f } = falso(() => resp(sesion('tok-B')));
    const api = nuevo(f, { cerrojos });
    await expect(api.refrescar()).resolves.toBe(true);
    expect(pedidos).toEqual([CERROJO_REFRESCO]);
  });

  it('renovar el token no avisa (no redibuja la vista); cambiar de cuenta o de rol sí', () => {
    const api = nuevo(falso(() => resp({})).f);
    /** @type {unknown[]} */
    const avisos = [];
    api.suscribir((u) => avisos.push(u));
    api.establecerSesion(sesion('tok-A'));
    api.establecerSesion(sesion('tok-B'));
    api.establecerSesion({ ...sesion('tok-C'), usuario: { ...USUARIO, rol: 'editor' } });
    expect(avisos).toHaveLength(2);
  });
});

describe('errores normalizados', () => {
  it('cuerpo de error del backend → ErrorApi con código, mensaje, solicitud y Retry-After', async () => {
    const api = nuevo(falso(() => error(429, 'cuenta_bloqueada', { 'retry-after': '42' })).f);
    const e = await api.solicitar('/auth/sesion', { metodo: 'POST', cuerpo: {}, sinSesion: true }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e).toMatchObject({ estado: 429, codigo: 'cuenta_bloqueada', solicitud: 'sol-1', reintentarEnSegundos: 42 });
    expect(mensajeParaPersona(e)).toMatch(/42 s/);
  });

  it('204 → undefined; sin red → "red"; tiempo agotado → "tiempo_agotado"', async () => {
    await expect(nuevo(falso(() => resp(null, 204)).f).solicitar('/x', { sinSesion: true })).resolves.toBeUndefined();
    const sinRed = nuevo(falso(() => Promise.reject(new TypeError('Failed to fetch'))).f);
    await expect(sinRed.solicitar('/x', { sinSesion: true })).rejects.toMatchObject({ codigo: 'red', estado: 0 });
    /** @type {typeof fetch} */
    const lento = (_u, init) => new Promise((_r, rechazar) => init?.signal?.addEventListener('abort', () => rechazar(new DOMException('x', 'AbortError'))));
    await expect(nuevo(lento, { tiempoMaximoMs: 20 }).solicitar('/x', { sinSesion: true })).rejects.toMatchObject({ codigo: 'tiempo_agotado' });
  });

  it('una cancelación de quien pidió (cambio de vista) no se convierte en error de red', async () => {
    /** @type {typeof fetch} */
    const lento = (_u, init) => new Promise((_r, rechazar) => init?.signal?.addEventListener('abort', () => rechazar(new DOMException('x', 'AbortError'))));
    const control = new AbortController();
    const p = nuevo(lento).solicitar('/x', { sinSesion: true, senal: control.signal });
    control.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('un 5xx sin cuerpo JSON también es un ErrorApi, con un mensaje claro para la persona', async () => {
    const e = await nuevo(falso(() => new Response('Bad Gateway', { status: 502 })).f)
      .solicitar('/x', { sinSesion: true })
      .catch((x) => x);
    expect(e).toMatchObject({ estado: 502, codigo: 'http_502' });
    expect(mensajeParaPersona(e)).toMatch(/servidor tuvo un problema/);
  });
});
