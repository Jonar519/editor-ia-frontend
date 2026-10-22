// Anclas de comentarios (bloque N): siguen al texto comentado cuando se edita alrededor (también lo que
// llega de otra réplica), no crecen con lo que se escribe en sus bordes, y si el tramo se borra quedan
// "sobre texto eliminado".
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { codificarAncla, resolverAncla } from '../../src/comentarios/anclas.js';

const tramo = (/** @type {Y.Doc} */ doc, /** @type {string} */ ancla) => {
  const r = resolverAncla(ancla, doc);
  return r ? doc.getText('contenido').toString().slice(r.inicio, r.fin) : null;
};

describe('anclas de comentarios', () => {
  it('siguen al tramo cuando se escribe antes, después y en sus bordes, también desde otra réplica', () => {
    const a = new Y.Doc();
    const ta = a.getText('contenido');
    ta.insert(0, 'uno dos tres');
    const ancla = codificarAncla(ta, 4, 7); // "dos"
    ta.insert(0, 'cero ');
    ta.insert(ta.length, ' cuatro');
    expect(tramo(a, ancla)).toBe('dos');
    // Lo escrito justo antes y justo después del tramo queda fuera.
    const r = resolverAncla(ancla, a);
    ta.insert(r?.inicio ?? 0, 'X');
    ta.insert((resolverAncla(ancla, a)?.fin ?? 0), 'Y');
    expect(tramo(a, ancla)).toBe('dos');
    // En otra réplica (que recibe todo después) el ancla apunta al mismo tramo.
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    expect(tramo(b, ancla)).toBe('dos');
  });

  it('si el tramo se borra entero, el ancla queda sobre texto eliminado (null); una mal formada también', () => {
    const doc = new Y.Doc();
    const t = doc.getText('contenido');
    t.insert(0, 'uno dos tres');
    const ancla = codificarAncla(t, 4, 7);
    t.delete(3, 5); // " dos "
    expect(resolverAncla(ancla, doc)).toBeNull();
    expect(resolverAncla('no-es-un-ancla', doc)).toBeNull();
  });
});
