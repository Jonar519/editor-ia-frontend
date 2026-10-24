// Autocompletado de la IA (bloque Q) con el estado REAL de CodeMirror (sin navegador: una vista mínima
// que aplica las transacciones). Lo que necesita un EditorView de verdad (la pausa de escritura, el
// widget en pantalla, el anuncio al llegar la sugerencia) lo prueba la E2E.
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { ANUNCIO, CONTEXTO, aceptar, campo, contexto, crearAnunciador, descartar, poner, vigente } from '../../src/diferidas/ia-autocompletado.js';

/** Una "vista" sin DOM: estado (con el campo del texto fantasma) y dispatch. */
function vista(/** @type {string} */ doc, /** @type {number} */ cursor) {
  /** @type {import('@codemirror/state').Transaction[]} */
  const transacciones = [];
  const v = {
    state: EditorState.create({ doc, selection: EditorSelection.cursor(cursor), extensions: [campo] }),
    transacciones,
    /** @param {import('@codemirror/state').TransactionSpec} spec */
    dispatch(spec) {
      const tr = v.state.update(spec);
      transacciones.push(tr);
      v.state = tr.state;
    },
  };
  return v;
}

describe('contexto que se manda', () => {
  it('recorta 2000 caracteres antes y 500 después del cursor', () => {
    const texto = `${'a'.repeat(3000)}|${'b'.repeat(900)}`;
    const c = contexto(texto, 3000);
    expect(c.antes).toBe('a'.repeat(CONTEXTO.antes));
    expect(c.despues).toBe(`|${'b'.repeat(CONTEXTO.despues - 1)}`);
  });

  it('al principio y al final del documento no inventa nada', () => {
    expect(contexto('hola', 0)).toEqual({ antes: '', despues: 'hola' });
    expect(contexto('hola', 4)).toEqual({ antes: 'hola', despues: '' });
  });
});

describe('anuncio del texto fantasma', () => {
  it('se anuncia UNA vez mientras se sigue escribiendo, y otra solo tras rearmar (aceptar, descartar, salir)', () => {
    /** @type {string[]} */
    const dichos = [];
    const a = crearAnunciador((t) => dichos.push(t));
    expect(a.quizas()).toBe(true);
    expect(a.quizas()).toBe(false);
    expect(a.quizas()).toBe(false);
    expect(dichos).toEqual([ANUNCIO]);
    a.rearmar();
    expect(a.quizas()).toBe(true);
    expect(dichos).toEqual([ANUNCIO, ANUNCIO]);
  });
});

describe('sugerencias vigentes y viejas', () => {
  const base = () => {
    const v = vista('Hola mun', 8);
    return { v, esperado: { pedido: 3, pos: 8, doc: v.state.doc } };
  };

  it('la del último pedido, con el texto y el cursor iguales, se muestra', () => {
    const { v, esperado } = base();
    expect(vigente({ tipo: 'ia.sugerencia', pedido: 3, texto: 'do' }, esperado, v.state)).toBe(true);
  });

  it('la de un pedido anterior se ignora', () => {
    const { v, esperado } = base();
    expect(vigente({ tipo: 'ia.sugerencia', pedido: 2, texto: 'do' }, esperado, v.state)).toBe(false);
  });

  it('si el documento cambió desde el pedido (otra persona o yo escribimos), se ignora', () => {
    const { v, esperado } = base();
    v.dispatch({ changes: { from: 0, insert: 'X' }, selection: { anchor: 8 } });
    expect(vigente({ tipo: 'ia.sugerencia', pedido: 3, texto: 'do' }, esperado, v.state)).toBe(false);
  });

  it('si el cursor se movió o hay selección, se ignora', () => {
    const { v, esperado } = base();
    v.dispatch({ selection: { anchor: 4 } });
    expect(vigente({ tipo: 'ia.sugerencia', pedido: 3, texto: 'do' }, esperado, v.state)).toBe(false);
    v.dispatch({ selection: { anchor: 5, head: 8 } });
    expect(vigente({ tipo: 'ia.sugerencia', pedido: 3, texto: 'do' }, esperado, v.state)).toBe(false);
  });

  it('sin texto (vacía o no es texto) no hay nada que mostrar', () => {
    const { v, esperado } = base();
    expect(vigente({ tipo: 'ia.sugerencia', pedido: 3, texto: '' }, esperado, v.state)).toBe(false);
    expect(vigente({ tipo: 'ia.sugerencia', pedido: 3 }, esperado, v.state)).toBe(false);
  });
});

describe('texto fantasma: Tab acepta, Escape descarta', () => {
  it('el fantasma NO está en el documento; cualquier cambio de texto o cursor lo quita', () => {
    const v = vista('Hola mun', 8);
    v.dispatch({ effects: poner.of({ pos: 8, texto: 'do' }) });
    expect(v.state.field(campo)).toEqual({ pos: 8, texto: 'do' });
    expect(v.state.doc.toString()).toBe('Hola mun');
    v.dispatch({ selection: { anchor: 3 } });
    expect(v.state.field(campo)).toBeNull();
    v.dispatch({ effects: poner.of({ pos: 3, texto: 'x' }) });
    v.dispatch({ changes: { from: 0, insert: '¡' } });
    expect(v.state.field(campo)).toBeNull();
  });

  it('Tab escribe la sugerencia como un cambio normal (input.ia) y deja el cursor al final', () => {
    const v = vista('Hola mun', 8);
    v.dispatch({ effects: poner.of({ pos: 8, texto: 'do' }) });
    expect(aceptar(v)).toBe(true);
    expect(v.state.doc.toString()).toBe('Hola mundo');
    expect(v.state.selection.main.head).toBe(10);
    expect(v.state.field(campo)).toBeNull();
    expect(v.transacciones.at(-1)?.isUserEvent('input.ia')).toBe(true);
  });

  it('sin sugerencia, Tab no hace nada y devuelve false (Tab sale del editor, WCAG 2.1.2)', () => {
    const v = vista('Hola', 4);
    expect(aceptar(v)).toBe(false);
    expect(v.transacciones).toHaveLength(0);
  });

  it('Escape quita la sugerencia sin tocar el documento; sin sugerencia devuelve false', () => {
    const v = vista('Hola mun', 8);
    v.dispatch({ effects: poner.of({ pos: 8, texto: 'do' }) });
    expect(descartar(v)).toBe(true);
    expect(v.state.doc.toString()).toBe('Hola mun');
    expect(v.state.field(campo)).toBeNull();
    expect(descartar(v)).toBe(false);
  });
});
