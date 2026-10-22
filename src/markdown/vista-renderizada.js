// La vista renderizada de un documento en vivo (bloque O): se redibuja cuando cambia el Y.Text (como mucho
// cada 150 ms) y, si hay bloques de código con lenguaje, carga el resaltado bajo demanda. Las marcas de los
// comentarios se vuelven a poner después de cada dibujo y después del resaltado (que reemplaza el código).
import { marcarEnVista } from '../comentarios/posiciones.js';
import { h } from '../dom.js';
import { renderizar } from './vista.js';

const ESPERA_MS = 150;

/**
 * @param {{ texto: import('yjs').Text, etiqueta: string, descripcion?: string }} o
 *   etiqueta: nombre accesible de la región; descripcion: id de un texto que la describe (aria-describedby)
 */
export function vistaRenderizada(o) {
  const el = h('div', { class: 'vista-renderizada', role: 'region', 'aria-label': o.etiqueta, 'aria-describedby': o.descripcion, tabindex: '0' });
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pendiente = null;
  let vacio = true;
  /** @type {import('../comentarios/panel.js').Marca[]} */
  let marcas = [];

  const marcar = () => {
    if (marcas.length || el.querySelector('span.comentado')) marcarEnVista(el, marcas);
  };

  const dibujar = () => {
    pendiente = null;
    const md = o.texto.toString();
    vacio = md.trim() === '';
    el.replaceChildren(vacio ? h('p', { class: 'vacio' }, 'Este documento está vacío.') : renderizar(md));
    marcar();
    if (el.querySelector('pre > code[data-lenguaje]')) {
      void import('../diferidas/highlight.js').then(
        (m) => {
          m.resaltarEn(el);
          marcar();
        },
        () => undefined, // sin el resaltado, el código se ve igual (sin colores)
      );
    }
    if (el.querySelector('[data-tex]')) {
      void import('../diferidas/katex.js').then(
        (m) => {
          m.dibujarFormulas(el);
          marcar();
        },
        () => undefined, // sin KaTeX, cada fórmula se ve como su fuente
      );
    }
  };
  const programar = () => {
    if (pendiente === null) pendiente = setTimeout(dibujar, ESPERA_MS);
  };
  o.texto.observe(programar);
  dibujar();

  return {
    el,
    /** ¿El documento está vacío? */
    vacio: () => vacio,
    /** Las marcas de los comentarios (tramos de la fuente). */
    ponerMarcas(/** @type {import('../comentarios/panel.js').Marca[]} */ nuevas) {
      marcas = nuevas;
      marcar();
    },
    destruir() {
      if (pendiente !== null) clearTimeout(pendiente);
      o.texto.unobserve(programar);
    },
  };
}
