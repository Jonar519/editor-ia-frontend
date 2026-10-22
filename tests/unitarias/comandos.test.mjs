// Comandos de Markdown del editor (bloque O) con el estado REAL de CodeMirror (sin navegador: una vista
// mínima que aplica las transacciones), el filtro de la paleta y el menú "/".
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { COMANDOS, atajoLegible, filtrar } from '../../src/vistas/editor/comandos.js';
import { fuenteBarra } from '../../src/vistas/editor/menu-barra.js';

/** Una "vista" sin DOM: estado y dispatch. */
function vista(/** @type {string} */ doc, /** @type {number} */ desde, hasta = desde) {
  const v = {
    state: EditorState.create({ doc, selection: EditorSelection.single(desde, hasta) }),
    /** @param {any} tr */
    dispatch(tr) {
      v.state = (tr.state ? tr : v.state.update(tr)).state;
    },
  };
  return v;
}
const comando = (/** @type {string} */ id) => {
  const c = COMANDOS.find((x) => x.id === id);
  if (!c) throw new Error(id);
  return c;
};
const aplicar = (/** @type {string} */ id, /** @type {ReturnType<typeof vista>} */ v) => comando(id).aplicar(/** @type {any} */ (v));
const seleccion = (/** @type {ReturnType<typeof vista>} */ v) => v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to);

describe('comandos de Markdown', () => {
  it('negrita envuelve la selección y, aplicada otra vez, la quita', () => {
    const v = vista('hola mundo', 5, 10);
    aplicar('negrita', v);
    expect(v.state.doc.toString()).toBe('hola **mundo**');
    expect(seleccion(v)).toBe('mundo');
    aplicar('negrita', v);
    expect(v.state.doc.toString()).toBe('hola mundo');
  });

  it('título y lista ponen el prefijo en cada línea, lo cambian si había otro y lo quitan si es el mismo', () => {
    const v = vista('uno\ndos', 0, 7);
    aplicar('lista', v);
    expect(v.state.doc.toString()).toBe('- uno\n- dos');
    aplicar('titulo2', v);
    expect(v.state.doc.toString()).toBe('## uno\n## dos');
    aplicar('titulo2', v);
    expect(v.state.doc.toString()).toBe('uno\ndos');
  });

  it('tabla y bloque de código van en un bloque propio, con el cursor dentro', () => {
    const v = vista('texto', 5);
    aplicar('tabla', v);
    expect(v.state.doc.toString()).toBe('texto\n\n| Columna | Columna |\n| --- | --- |\n| | |\n');
    const b = vista('', 0);
    aplicar('bloque-codigo', b);
    expect(b.state.doc.toString()).toBe('```\n\n```\n');
    expect(b.state.selection.main.head).toBe(4);
    // En una línea vacía justo después de una lista: una línea en blanco antes (si no, la tabla sería parte
    // de la lista; lo encontró la E2E).
    const l = vista('- uno\n', 6);
    aplicar('tabla', l);
    expect(l.state.doc.toString()).toBe('- uno\n\n| Columna | Columna |\n| --- | --- |\n| | |\n');
  });

  it('enlace: la selección queda como texto y el cursor en la dirección', () => {
    const v = vista('ver la guía', 7, 11);
    aplicar('enlace', v);
    expect(v.state.doc.toString()).toBe('ver la [guía](https://)');
    expect(v.state.selection.main.head).toBe('ver la [guía](https://'.length);
  });

  it('el filtro busca en el nombre y las palabras clave, sin acentos ni mayúsculas', () => {
    expect(filtrar(COMANDOS, 'TITULO').map((c) => c.id)).toEqual(['titulo1', 'titulo2', 'titulo3']);
    expect(filtrar(COMANDOS, 'código').map((c) => c.id)).toEqual(['codigo', 'bloque-codigo']);
    expect(filtrar(COMANDOS, 'h1').map((c) => c.id)).toEqual(['titulo1']);
    expect(atajoLegible('Mod-Shift-x', false)).toBe('Ctrl+Mayús+X');
  });

  it('menú "/": aparece al principio de la línea o tras un espacio (no dentro de una palabra) y filtra', () => {
    const contexto = (/** @type {string} */ doc) => new CompletionContext(EditorState.create({ doc }), doc.length, false);
    expect(fuenteBarra(contexto('/'))?.options).toHaveLength(COMANDOS.length);
    expect(fuenteBarra(contexto('texto /tab'))?.options.map((o) => o.label)).toEqual(['Tabla']);
    expect(fuenteBarra(contexto('https://ejemplo'))).toBeNull();
    expect(fuenteBarra(contexto('a/b'))).toBeNull();
  });
});
