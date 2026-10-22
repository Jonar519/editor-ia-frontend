// Diferencia por líneas del navegador (bloque N): con semilla, sobre textos al azar.
import { describe, expect, it } from 'vitest';
import { diferenciaPorLineas, partirLineas } from '../../src/diff/lineas.js';

function azarCon(/** @type {number} */ semilla) {
  let a = semilla >>> 0;
  return (/** @type {number} */ n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

const textoAlAzar = (/** @type {(n: number) => number} */ entero) =>
  Array.from({ length: entero(25) }, () => ['# Título', 'uno', 'dos', '', '```', 'código', '- lista'][entero(7)] ?? '').join('\n') + (entero(2) === 0 ? '\n' : '');

describe('diferencia por líneas (navegador)', () => {
  it('partir y unir reproduce el texto exacto', () => {
    for (const t of ['', 'a', 'a\n', 'a\nb', 'a\r\nb\r\n', '\n\n']) expect(partirLineas(t).join('')).toBe(t);
  });

  it('con semilla: las operaciones llevan de A a B', () => {
    for (let s = 1; s <= 300; s++) {
      const entero = azarCon(s);
      const a = textoAlAzar(entero);
      const b = textoAlAzar(entero);
      const ops = diferenciaPorLineas(a, b);
      expect(ops.filter((o) => o.tipo !== 'agregar').flatMap((o) => o.lineas).join(''), `semilla ${String(s)}`).toBe(a);
      expect(ops.filter((o) => o.tipo !== 'quitar').flatMap((o) => o.lineas).join(''), `semilla ${String(s)}`).toBe(b);
    }
  });

  it('mínima: cambiar una línea en medio es quitar una y agregar una', () => {
    expect(diferenciaPorLineas('a\nb\nc\n', 'a\nX\nc\n')).toEqual([
      { tipo: 'igual', lineas: ['a\n'] },
      { tipo: 'quitar', lineas: ['b\n'] },
      { tipo: 'agregar', lineas: ['X\n'] },
      { tipo: 'igual', lineas: ['c\n'] },
    ]);
  });
});
