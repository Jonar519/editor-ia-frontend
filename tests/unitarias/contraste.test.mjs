import { describe, expect, it } from 'vitest';
import { analizarCss } from '../../scripts/lib/css.mjs';
import { contraste, hexARgb, luminancia, medirPares, primitivoDe, resolver, temas } from '../../scripts/lib/contraste.mjs';

describe('analizarCss', () => {
  it('declaraciones con selector, contexto (@media) y línea; ignora comentarios; registra @keyframes', () => {
    const hoja = analizarCss(`/* a: red; */
:root {
  --x: #fff;
  --y: var(--x);
}
@media (prefers-color-scheme: dark) {
  :root { --y: #000; }
}
@keyframes giro { from { opacity: 0 } to { opacity: 1 } }
p { color: var(--y); background: url("a;b.png") }`);
    expect(hoja.declaraciones.map((d) => [d.selector, d.propiedad, d.valor, d.contexto.join('|'), d.linea])).toEqual([
      [':root', '--x', '#fff', '', 3],
      [':root', '--y', 'var(--x)', '', 4],
      [':root', '--y', '#000', '@media (prefers-color-scheme: dark)', 7],
      ['p', 'color', 'var(--y)', '', 10],
      ['p', 'background', 'url("a;b.png")', '', 10],
    ]);
    expect(hoja.keyframes.map((k) => k.nombre)).toEqual(['giro']);
  });
});

describe('contraste WCAG 2.x', () => {
  it('convierte hexadecimales de 3 y 6 dígitos', () => {
    expect(hexARgb('#fff')).toEqual([255, 255, 255]);
    expect(hexARgb('#1d4f9f')).toEqual([29, 79, 159]);
    expect(() => hexARgb('rgb(0,0,0)')).toThrow(/hexadecimal/);
  });

  it('luminancia: blanco 1, negro 0, y la curva sRGB (no lineal)', () => {
    expect(luminancia('#ffffff')).toBe(1);
    expect(luminancia('#000000')).toBe(0);
    // Gris medio #808080: 0.2159 con la curva sRGB (sería 0.502 si fuera lineal).
    expect(luminancia('#808080')).toBeCloseTo(0.2159, 4);
  });

  it('razón: negro sobre blanco 21:1; es simétrica', () => {
    expect(contraste('#000', '#fff')).toBe(21);
    expect(contraste('#fff', '#000')).toBe(21);
  });

  it('valores de referencia: #767676 sobre blanco cumple 4.5; #777777 no (4.48, sin redondear)', () => {
    expect(contraste('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contraste('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });
});

const TOKENS = `:root {
  --paleta-blanco: #ffffff;
  --paleta-negro: #000000;
  --paleta-gris: #777777;
  --color-fondo: var(--paleta-blanco);
  --color-texto: var(--paleta-negro);
  --color-suave: var(--paleta-gris);
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-fondo: var(--paleta-negro);
    --color-texto: var(--paleta-blanco);
  }
}`;

describe('temas y resolución de variables', () => {
  it('el oscuro hereda del claro lo que no redefine', () => {
    const t = temas(TOKENS);
    expect(resolver('--color-texto', t.claro)).toBe('#000000');
    expect(resolver('--color-texto', t.oscuro)).toBe('#ffffff');
    expect(resolver('--color-suave', t.oscuro)).toBe('#777777');
    expect([...t.soloOscuro.keys()]).toEqual(['--color-fondo', '--color-texto']);
    expect(primitivoDe('--color-fondo', t.oscuro)).toBe('--paleta-negro');
  });

  it('detecta variables sin definir y ciclos', () => {
    expect(() => resolver('--nada', new Map())).toThrow(/sin definir/);
    expect(() => resolver('--a', new Map([['--a', 'var(--b)'], ['--b', 'var(--a)']]))).toThrow(/ciclo/);
  });

  it('mide cada par en los dos temas y marca el que no llega al mínimo', () => {
    const m = medirPares(TOKENS, [
      { texto: '--color-texto', fondo: '--color-fondo', minimo: 4.5 },
      { texto: '--color-suave', fondo: '--color-fondo', minimo: 4.5 },
    ]);
    expect(m.map((x) => [x.tema, x.texto, x.cumple])).toEqual([
      ['claro', '--color-texto', true],
      ['claro', '--color-suave', false], // 4.48 sobre blanco
      ['oscuro', '--color-texto', true],
      ['oscuro', '--color-suave', true], // 4.69 sobre negro
    ]);
  });
});
