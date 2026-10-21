// "Aquí ahora": la lista de personas en el documento, con su nombre (texto) y la muestra de su color.
import { h } from '../dom.js';
import { personasPresentes } from './presencia.js';

/**
 * @param {import('y-protocols/awareness').Awareness} presencia
 * @param {{ id: string, nombre: string }} yo
 */
export function quienEsta(presencia, yo) {
  const lista = h('ul', { class: 'quien-esta-lista' });
  const el = h('section', { class: 'quien-esta', 'aria-labelledby': 'quien-esta-titulo' }, h('h2', { id: 'quien-esta-titulo', class: 'quien-esta-titulo' }, 'Aquí ahora'), lista);
  const dibujar = () => {
    lista.replaceChildren(
      ...personasPresentes(presencia, yo).map((p) =>
        h('li', { 'data-usuario': p.id }, h('span', { class: `muestra-presencia presencia-${String(p.indice)}`, 'aria-hidden': 'true' }), p.soyYo ? `${p.nombre} (tú)` : p.nombre),
      ),
    );
  };
  presencia.on('change', dibujar);
  dibujar();
  return el;
}
