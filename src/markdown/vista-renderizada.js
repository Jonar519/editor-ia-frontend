// La vista renderizada de un documento en vivo (bloque O): se redibuja cuando cambia el Y.Text (como mucho
// cada 150 ms) y, si hay bloques de código con lenguaje, carga el resaltado bajo demanda.
import { h } from '../dom.js';
import { renderizar } from './vista.js';

const ESPERA_MS = 150;

/**
 * @param {{ texto: import('yjs').Text, etiqueta: string }} o  etiqueta: nombre accesible de la región
 */
export function vistaRenderizada(o) {
  const el = h('div', { class: 'vista-renderizada', role: 'region', 'aria-label': o.etiqueta, tabindex: '0' });
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pendiente = null;
  let vacio = true;

  const dibujar = () => {
    pendiente = null;
    const md = o.texto.toString();
    vacio = md.trim() === '';
    el.replaceChildren(vacio ? h('p', { class: 'vacio' }, 'Este documento está vacío.') : renderizar(md));
    if (el.querySelector('pre > code[data-lenguaje]')) {
      void import('../diferidas/highlight.js').then(
        (m) => m.resaltarEn(el),
        () => undefined, // sin el resaltado, el código se ve igual (sin colores)
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
    destruir() {
      if (pendiente !== null) clearTimeout(pendiente);
      o.texto.unobserve(programar);
    },
  };
}
