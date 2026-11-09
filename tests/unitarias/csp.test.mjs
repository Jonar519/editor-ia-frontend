// La CSP del build (bloque R, decisiones escritas): script-src estricto, 'unsafe-inline' solo en los dos
// destinos de estilo aprobados, y nada que se cuele por otra directiva. La E2E comprueba además que el
// build la lleva y que ninguna pantalla la viola.
import { describe, expect, it } from 'vitest';
import { directivas, origenApiDelBuild, politica } from '../../scripts/lib/csp.mjs';
import { API_POR_DEFECTO, normalizarOrigenApi, origenWebSocket } from '../../src/api/origen.js';

/** El API de producción: otro origen del mismo sitio que el frontend. */
const API = 'https://api-cuaderno.example.com';
const CSP = politica(API);
const DIRECTIVAS = directivas(API);

/** La política leída de su texto, como la leería el navegador. */
const leida = Object.fromEntries(
  CSP.split(';').map((d) => {
    const [nombre = '', ...fuentes] = d.trim().split(/\s+/);
    return [nombre, fuentes];
  }),
);

describe('CSP del build', () => {
  it("script-src es exactamente 'self': sin 'unsafe-inline', 'unsafe-eval', 'unsafe-hashes', 'wasm-unsafe-eval' ni comodines", () => {
    expect(leida['script-src']).toEqual(["'self'"]);
    expect(leida['default-src']).toEqual(["'self'"]);
    for (const d of ['script-src', 'script-src-elem', 'script-src-attr', 'default-src']) {
      expect(leida[d] ?? [], d).not.toEqual(expect.arrayContaining([expect.stringMatching(/unsafe|^\*$|^data:$|^blob:$|^https?:$/)]));
    }
  });

  it("'unsafe-inline' solo en style-src-elem (CodeMirror) y style-src-attr (presencia), nunca en otra directiva", () => {
    const con = Object.entries(leida)
      .filter(([, f]) => f.includes("'unsafe-inline'"))
      .map(([n]) => n)
      .sort();
    expect(con).toEqual(['style-src-attr', 'style-src-elem']);
    expect(leida['style-src']).toEqual(["'self'"]);
  });

  it("worker-src 'self' (comparación de versiones y Service Worker); objetos y base cerrados; todo lo demás del propio origen", () => {
    expect(leida['worker-src']).toEqual(["'self'"]);
    expect(leida['object-src']).toEqual(["'none'"]);
    expect(leida['base-uri']).toEqual(["'none'"]);
    expect(leida['font-src']).toEqual(["'self'"]);
    expect(leida['form-action']).toEqual(["'self'"]);
  });

  it('connect-src: la página y SOLO el origen del API, en https y wss (nada de comodines)', () => {
    expect(leida['connect-src']).toEqual(["'self'", API, 'wss://api-cuaderno.example.com']);
    expect(directivas('http://127.0.0.1:4200')['connect-src']).toEqual(["'self'", 'http://127.0.0.1:4200', 'ws://127.0.0.1:4200']);
  });

  it('el texto es la misma política que las directivas (sin repetidas)', () => {
    expect(Object.keys(leida)).toEqual(Object.keys(DIRECTIVAS));
    expect(leida).toEqual(DIRECTIVAS);
  });
});

describe('origen del API (VITE_API_URL)', () => {
  it('vacío = el backend de desarrollo (mismo sitio que 127.0.0.1:5175)', () => {
    expect(normalizarOrigenApi(undefined)).toBe(API_POR_DEFECTO);
    expect(normalizarOrigenApi('  ')).toBe('http://127.0.0.1:4200');
  });

  it('se queda solo con el origen; https → wss y http → ws', () => {
    expect(normalizarOrigenApi(`${API}/`)).toBe(API);
    expect(origenWebSocket(API)).toBe('wss://api-cuaderno.example.com');
    expect(origenWebSocket('http://127.0.0.1:4200')).toBe('ws://127.0.0.1:4200');
  });

  it.each([
    ['no es URL', 'api-cuaderno.example.com'],
    ['esquema raro', 'ftp://api.example.com'],
    ['con ruta', 'https://api.example.com/api'],
    ['con query', 'https://api.example.com/?x=1'],
    ['con credenciales', 'https://u:p@api.example.com'],
  ])('rechaza %s', (_n, valor) => {
    expect(() => normalizarOrigenApi(valor)).toThrow(/VITE_API_URL/);
  });

  it('en Vercel es obligatoria y https (un build sin ella apuntaría en silencio al backend local)', () => {
    expect(() => origenApiDelBuild(undefined, { enVercel: true })).toThrow(/Falta VITE_API_URL/);
    expect(() => origenApiDelBuild('http://api.example.com', { enVercel: true })).toThrow(/https/);
    expect(origenApiDelBuild(`${API}/`, { enVercel: true })).toBe(API);
    expect(origenApiDelBuild(undefined)).toBe(API_POR_DEFECTO);
  });
});
