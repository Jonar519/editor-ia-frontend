// Service Worker: la estrategia de caché (función pura de src/sw/sw.js, cargada en un contexto aislado
// con un `self` falso) y la lista de precarga que calcula el build.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { listaPrecache, versionDe } from '../../scripts/sw-precache.mjs';

const ORIGEN = 'http://127.0.0.1:5175';

/** Carga sw.js como lo haría el navegador, con los marcadores ya reemplazados, y devuelve `estrategia`. */
function cargarSw() {
  const texto = readFileSync(path.join(import.meta.dirname, '../../src/sw/sw.js'), 'utf8')
    .replace("const VERSION = '__VERSION__';", "const VERSION = 'prueba';")
    .replace('const PRECACHE = __PRECACHE__;', "const PRECACHE = ['/'];");
  const ctx = { self: { addEventListener: () => undefined, location: { origin: ORIGEN } }, URL, caches: {}, fetch: () => undefined, Response };
  vm.createContext(ctx);
  vm.runInContext(`${texto}\nthis.estrategia = estrategia;`, ctx);
  return /** @type {(p: { url: string, metodo: string, modo: string, origen: string }) => string} */ (/** @type {any} */ (ctx).estrategia);
}
const estrategia = cargarSw();
const pedir = (/** @type {string} */ ruta, metodo = 'GET', modo = 'cors') => estrategia({ url: `${ORIGEN}${ruta}`, metodo, modo, origen: ORIGEN });

describe('estrategia del Service Worker', () => {
  it('/api NUNCA pasa por la caché (ni GET, ni navegación, ni subrutas)', () => {
    expect(pedir('/api/cuenta')).toBe('ignorar');
    expect(pedir('/api/auth/refresco', 'POST')).toBe('ignorar');
    expect(pedir('/api', 'GET', 'navigate')).toBe('ignorar');
    expect(pedir('/api/usuarios/1/avatar')).toBe('ignorar');
  });

  it('solo GET y del mismo origen', () => {
    expect(pedir('/assets/a.js', 'POST')).toBe('ignorar');
    // Aunque la ruta parezca de /assets: si es de otro origen, no se toca.
    expect(estrategia({ url: 'https://cdn.example.com/assets/x.js', metodo: 'GET', modo: 'cors', origen: ORIGEN })).toBe('ignorar');
  });

  it('la caché de /assets ignora Vary (el servidor manda "Vary: Origin" y los módulos mandan Origin)', () => {
    const texto = readFileSync(path.join(import.meta.dirname, '../../src/sw/sw.js'), 'utf8');
    expect(texto).toMatch(/caches\.match\(req, \{ ignoreVary: true \}\)/);
  });

  it('navegación: red primero; /assets (con hash): caché primero; el propio sw.js, nunca', () => {
    expect(pedir('/', 'GET', 'navigate')).toBe('red-primero');
    expect(pedir('/assets/index-abc.js')).toBe('cache-primero');
    expect(pedir('/sw.js')).toBe('ignorar');
    expect(pedir('/favicon.ico')).toBe('ignorar');
  });
});

describe('lista de precarga', () => {
  const ARCHIVOS = [
    { archivo: 'assets/index.js', tipo: /** @type {const} */ ('chunk'), esEntrada: true, modulo: '/r/index.html', importaciones: ['assets/sesion.js'], css: ['assets/index.css'] },
    { archivo: 'assets/sesion.js', tipo: /** @type {const} */ ('chunk'), modulo: '/r/src/sesion.js' },
    { archivo: 'assets/inicio.js', tipo: /** @type {const} */ ('chunk'), modulo: '/r/src/vistas/publico/inicio.js', importaciones: ['assets/dom.js'] },
    { archivo: 'assets/dom.js', tipo: /** @type {const} */ ('chunk'), modulo: '/r/src/dom.js' },
    { archivo: 'assets/editar.js', tipo: /** @type {const} */ ('chunk'), modulo: '/r/src/vistas/editor/editar.js' },
    { archivo: 'assets/panel.js', tipo: /** @type {const} */ ('chunk'), modulo: 'C:\\r\\src\\vistas\\admin\\panel.js' },
    { archivo: 'assets/index.css', tipo: /** @type {const} */ ('asset') },
    { archivo: 'assets/fuente-latin.woff2', tipo: /** @type {const} */ ('asset') },
  ];

  it('precarga el armazón y las vistas públicas; NO el código de otros roles ni las fuentes', () => {
    expect(listaPrecache(ARCHIVOS)).toEqual(['/', '/assets/dom.js', '/assets/index.css', '/assets/index.js', '/assets/inicio.js', '/assets/sesion.js']);
  });

  it('la versión cambia si cambia cualquier archivo del build', () => {
    const a = versionDe(['assets/index-1.js', 'sw.js']);
    expect(versionDe(['sw.js', 'assets/index-1.js'])).toBe(a);
    expect(versionDe(['assets/index-2.js', 'sw.js'])).not.toBe(a);
  });
});
