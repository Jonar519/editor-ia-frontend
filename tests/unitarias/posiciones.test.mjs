// Cálculo de posiciones para anclar desde la vista renderizada (cierre de O): de un punto de una pieza a la
// fuente y de vuelta, con semilla. La parte del DOM (selección, marcas, "Ir al texto") la prueba la E2E.
import { describe, expect, it } from 'vitest';
import { aFuente, desdeFuente, exacta } from '../../src/comentarios/posiciones.js';

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

describe('posiciones de la vista renderizada', () => {
  it('pieza exacta: cada carácter de la vista es el mismo de la fuente, ida y vuelta (con semilla)', () => {
    for (let s = 1; s <= 500; s++) {
      const n = azarCon(s);
      const desde = n(1000);
      const largo = 1 + n(80);
      const p = { desde, hasta: desde + largo, largo };
      expect(exacta(p)).toBe(true);
      const k = n(largo + 1);
      for (const lado of /** @type {const} */ (['inicio', 'fin'])) {
        const f = aFuente(p, k, lado);
        expect(f, `semilla ${String(s)}`).toBe(desde + k);
        expect(desdeFuente(p, f)).toBe(k);
      }
    }
  });

  it('pieza no exacta (escapes, entidades, "Imagen: ..."): el inicio se ajusta al principio y el fin al final', () => {
    // "a&amp;b" en la fuente (7) se ve como "a&b" (3).
    const p = { desde: 10, hasta: 17, largo: 3 };
    expect(exacta(p)).toBe(false);
    expect(aFuente(p, 1, 'inicio')).toBe(10);
    expect(aFuente(p, 1, 'fin')).toBe(17);
    expect(aFuente(p, 0, 'fin')).toBe(10);
    expect(aFuente(p, 3, 'inicio')).toBe(17);
    expect(desdeFuente(p, 12)).toBe(0);
    expect(desdeFuente(p, 17)).toBe(3);
  });

  it('fuera de la pieza, desdeFuente se queda en sus bordes; y la posición nunca sale de la pieza (con semilla)', () => {
    for (let s = 1; s <= 300; s++) {
      const n = azarCon(s);
      const desde = n(500);
      const hasta = desde + n(60);
      const p = { desde, hasta, largo: n(70) };
      const k = n(100) - 10;
      for (const lado of /** @type {const} */ (['inicio', 'fin'])) {
        const f = aFuente(p, k, lado);
        expect(f).toBeGreaterThanOrEqual(p.desde);
        expect(f).toBeLessThanOrEqual(p.hasta);
      }
      expect(desdeFuente(p, desde - 5)).toBe(0);
      expect(desdeFuente(p, hasta + 5)).toBe(p.largo);
    }
  });
});
