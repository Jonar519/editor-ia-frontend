// Fórmulas de la vista renderizada (bloque O): KaTeX con su CSS, cargado bajo demanda (diferida "katex",
// tope aprobado de 75 KiB de JS). Las fuentes de KaTeX se descargan aparte y solo las que usa cada fórmula.
//
// katex.render construye el DOM con createElement (no usa innerHTML). Opciones de seguridad:
//   - trust: false   sin \href, \url, \includegraphics ni \html*: una fórmula no crea enlaces ni carga nada;
//   - maxSize y maxExpand acotados: una fórmula no puede colgar la página con macros que se expanden;
//   - throwOnError: false   una fórmula mal escrita se ve como su fuente marcada como error, no rompe nada.
import katex from 'katex';
import 'katex/dist/katex.min.css';

/** @type {import('katex').KatexOptions} */
const OPCIONES = { throwOnError: false, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 300, output: 'htmlAndMathml' };

/** Dibuja cada fórmula ([data-tex]) dentro del contenedor. */
export function dibujarFormulas(/** @type {ParentNode} */ contenedor) {
  for (const el of contenedor.querySelectorAll('[data-tex]')) {
    const tex = el.getAttribute('data-tex') ?? '';
    try {
      katex.render(tex, /** @type {HTMLElement} */ (el), { ...OPCIONES, displayMode: el.classList.contains('formula-bloque') });
    } catch {
      // Si algo falla igual, la fuente que ya estaba se queda a la vista.
    }
  }
}
