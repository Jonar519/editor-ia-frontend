// Resaltado de los bloques de código de la vista renderizada (bloque O): highlight.js con su conjunto
// "common", cargado bajo demanda (diferida "highlight", tope 60 KiB, medida 51,1).
//
// highlight.js devuelve HTML. NO se inserta: se analiza en un documento aparte (DOMParser, que no ejecuta
// nada) y se COPIA solo lo de la lista blanca: <span class="hljs-..."> y texto. Si el resultado no
// reproduce exactamente el código, se deja el código sin resaltar. Solo se resaltan lenguajes indicados
// en el bloque (```js); sin lenguaje, el código queda tal cual (adivinar se equivoca y cuesta).
import hljs from 'highlight.js/lib/common';

const CLASE = /^hljs-[a-z_-]+( [a-z_-]+)*$/;

/**
 * Copia segura de un nodo del resultado de highlight.js: texto, o <span> con clase hljs-*. Cualquier
 * otro elemento deja solo su texto.
 * @param {Node} origen @param {Node} destino @param {Document} doc
 */
function copiar(origen, destino, doc) {
  for (const n of origen.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      destino.appendChild(doc.createTextNode(n.textContent ?? ''));
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = /** @type {Element} */ (n);
      const clase = el.getAttribute('class') ?? '';
      if (el.nodeName === 'SPAN' && CLASE.test(clase)) {
        const span = doc.createElement('span');
        span.setAttribute('class', clase);
        copiar(el, span, doc);
        destino.appendChild(span);
      } else {
        copiar(el, destino, doc);
      }
    }
  }
}

/**
 * Resalta un bloque <code data-lenguaje="..."> en su lugar. Devuelve true si lo resaltó.
 * @param {HTMLElement} code
 */
export function resaltarBloque(code) {
  const lenguaje = code.getAttribute('data-lenguaje');
  if (!lenguaje || !hljs.getLanguage(lenguaje)) return false;
  const fuente = code.textContent ?? '';
  const html = hljs.highlight(fuente, { language: lenguaje, ignoreIllegals: true }).value;
  const analizado = new DOMParser().parseFromString(`<pre>${html}</pre>`, 'text/html').body.firstChild;
  if (!analizado) return false;
  const doc = code.ownerDocument;
  const fragmento = doc.createDocumentFragment();
  copiar(analizado, fragmento, doc);
  if (fragmento.textContent !== fuente) return false; // nunca cambiar el código que se ve
  code.replaceChildren(fragmento);
  code.classList.add('hljs');
  return true;
}

/** Resalta todos los bloques de código con lenguaje dentro de un contenedor. */
export function resaltarEn(/** @type {ParentNode} */ contenedor) {
  for (const code of contenedor.querySelectorAll('pre > code[data-lenguaje]')) resaltarBloque(/** @type {HTMLElement} */ (code));
}
