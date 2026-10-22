// Marcas de los comentarios en el editor (bloque N): subrayado punteado en cada tramo comentado (y sólido
// en el hilo activo). Sin colores nuevos: el subrayado usa el color del texto. Las marcas se mueven con
// las ediciones (map) hasta que el panel manda las nuevas.
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

/** @type {import('@codemirror/state').StateEffectType<import('../../comentarios/panel.js').Marca[]>} */
const ponerMarcas = StateEffect.define();

const campo = StateField.define({
  create: () => Decoration.none,
  update(marcas, tr) {
    let r = marcas.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(ponerMarcas)) continue;
      const largo = tr.state.doc.length;
      const validas = e.value.filter((m) => m.inicio < m.fin && m.fin <= largo).sort((a, b) => a.inicio - b.inicio);
      r = Decoration.set(
        validas.map((m) => Decoration.mark({ class: m.activa ? 'comentado comentado-activo' : 'comentado', attributes: { 'data-comentario': m.id } }).range(m.inicio, m.fin)),
        true,
      );
    }
    return r;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export const marcasComentarios = campo;

/** @param {EditorView} vista @param {import('../../comentarios/panel.js').Marca[]} marcas */
export function dibujarMarcas(vista, marcas) {
  vista.dispatch({ effects: ponerMarcas.of(marcas) });
}
