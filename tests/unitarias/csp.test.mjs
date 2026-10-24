// La CSP del build (bloque R, decisiones escritas): script-src estricto, 'unsafe-inline' solo en los dos
// destinos de estilo aprobados, y nada que se cuele por otra directiva. La E2E comprueba además que el
// build la lleva y que ninguna pantalla la viola.
import { describe, expect, it } from 'vitest';
import { CSP, DIRECTIVAS } from '../../scripts/lib/csp.mjs';

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
    expect(leida['connect-src']).toEqual(["'self'"]);
    expect(leida['form-action']).toEqual(["'self'"]);
  });

  it('el texto es la misma política que las directivas (sin repetidas)', () => {
    expect(Object.keys(leida)).toEqual(Object.keys(DIRECTIVAS));
    expect(leida).toEqual(DIRECTIVAS);
  });
});
