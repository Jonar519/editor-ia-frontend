// Anclar comentarios desde la VISTA RENDERIZADA (cierre del bloque O, diseño aprobado): la selección del
// ratón o del dedo en la vista se traduce a posiciones del Markdown fuente, y de ahí a la misma ancla de
// siempre (dos posiciones relativas de Yjs). Al revés, un tramo de la fuente se ubica en la vista para
// subrayarlo y para "Ir al texto".
//
// Cada "pieza" de la vista es un elemento con data-desde (y data-hasta): un trozo de texto, o un bloque de
// código (data-desde y su largo). Si el texto de la pieza mide lo mismo que su tramo en la fuente, la
// correspondencia es exacta, carácter a carácter; si no (escapes, entidades, "Imagen: ..."), un extremo
// se ajusta al borde de la pieza: el inicio al principio y el fin al final.
//
// Con el teclado, la selección exacta se hace en el texto fuente (la vista no es editable ni lleva
// contenteditable).

/**
 * @typedef {{ desde: number, hasta: number, largo: number }} Pieza  largo: caracteres de su texto en la vista
 * @typedef {'inicio' | 'fin'} Lado
 */

/** ¿La pieza corresponde carácter a carácter con su tramo de la fuente? */
export const exacta = (/** @type {Pieza} */ p) => p.hasta - p.desde === p.largo;

/**
 * Posición en la fuente de un punto dentro de una pieza (k caracteres desde su principio).
 * @param {Pieza} p @param {number} k @param {Lado} lado
 */
export function aFuente(p, k, lado) {
  if (k <= 0) return p.desde;
  if (k >= p.largo) return p.hasta;
  if (exacta(p)) return p.desde + k;
  return lado === 'inicio' ? p.desde : p.hasta;
}

/**
 * Al revés: cuántos caracteres dentro de la pieza corresponden a una posición de la fuente.
 * @param {Pieza} p @param {number} s
 */
export function desdeFuente(p, s) {
  if (s <= p.desde) return 0;
  if (s >= p.hasta) return p.largo;
  return exacta(p) ? s - p.desde : 0;
}

// ─── En el DOM ───────────────────────────────────────────────────────────────────

const SELECTOR = 'span[data-desde], code[data-desde]';

/** Las piezas de la vista, en orden del documento, con su elemento. */
function piezas(/** @type {Element} */ raiz) {
  return [...raiz.querySelectorAll(SELECTOR)].map((el) => {
    const desde = Number(el.getAttribute('data-desde'));
    const largo = el.textContent?.length ?? 0;
    const h = el.getAttribute('data-hasta');
    return { el, desde, hasta: h === null ? desde + largo : Number(h), largo };
  });
}

/**
 * La posición en la fuente de un punto del DOM (un extremo de la selección).
 * @param {Element} raiz @param {Node} nodo @param {number} desplazamiento @param {Lado} lado
 */
export function puntoAFuente(raiz, nodo, desplazamiento, lado) {
  const todas = piezas(raiz);
  let anterior = null;
  for (const p of todas) {
    const r = raiz.ownerDocument.createRange();
    r.selectNodeContents(p.el);
    const c = r.comparePoint(nodo, desplazamiento);
    if (c === 0) {
      // Dentro: los caracteres desde el principio de la pieza hasta el punto.
      r.setEnd(nodo, desplazamiento);
      return aFuente(p, r.toString().length, lado);
    }
    if (c < 0) return lado === 'inicio' ? p.desde : (anterior?.hasta ?? p.desde);
    anterior = p;
  }
  return anterior?.hasta ?? 0;
}

/** La selección actual dentro de la vista, en posiciones de la fuente (o null si no hay o no es de la vista). */
export function seleccionAFuente(/** @type {Element} */ raiz) {
  const sel = raiz.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!raiz.contains(r.startContainer) || !raiz.contains(r.endContainer)) return null;
  const inicio = puntoAFuente(raiz, r.startContainer, r.startOffset, 'inicio');
  const fin = puntoAFuente(raiz, r.endContainer, r.endOffset, 'fin');
  return fin > inicio ? { inicio, fin } : null;
}

/** El nodo de texto y el desplazamiento del carácter k dentro de un elemento. */
function puntoEnElemento(/** @type {Element} */ el, /** @type {number} */ k) {
  const caminante = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let restante = k;
  /** @type {Text | null} */
  let ultimo = null;
  for (let t = /** @type {Text | null} */ (caminante.nextNode()); t; t = /** @type {Text | null} */ (caminante.nextNode())) {
    if (restante <= t.length) return { nodo: t, desplazamiento: restante };
    restante -= t.length;
    ultimo = t;
  }
  return ultimo ? { nodo: ultimo, desplazamiento: ultimo.length } : { nodo: el, desplazamiento: 0 };
}

/**
 * Un tramo de la fuente como Range de la vista (o null si no cae en ninguna pieza).
 * @param {Element} raiz @param {number} inicio @param {number} fin
 */
export function fuenteARango(raiz, inicio, fin) {
  const todas = piezas(raiz);
  const primera = todas.find((p) => p.hasta > inicio);
  const ultima = [...todas].reverse().find((p) => p.desde < fin);
  if (!primera || !ultima) return null;
  const a = puntoEnElemento(primera.el, desdeFuente(primera, inicio));
  const b = puntoEnElemento(ultima.el, desdeFuente(ultima, fin));
  const r = raiz.ownerDocument.createRange();
  r.setStart(a.nodo, a.desplazamiento);
  r.setEnd(b.nodo, b.desplazamiento);
  return r.collapsed ? null : r;
}

/** Quita las marcas de comentarios de la vista (deja el texto como estaba). */
function quitarMarcas(/** @type {Element} */ raiz) {
  for (const m of raiz.querySelectorAll('span.comentado')) {
    const padre = m.parentNode;
    if (!padre) continue;
    m.replaceWith(...m.childNodes);
    padre.normalize();
  }
}

/**
 * Subraya en la vista los tramos de los hilos (partiendo los nodos de texto; también dentro del código
 * resaltado). Sin colores nuevos: el mismo subrayado que en el editor.
 * @param {Element} raiz @param {import('./panel.js').Marca[]} marcas
 */
export function marcarEnVista(raiz, marcas) {
  quitarMarcas(raiz);
  const doc = raiz.ownerDocument;
  for (const m of marcas) {
    const rango = fuenteARango(raiz, m.inicio, m.fin);
    if (!rango) continue;
    /** @type {Text[]} */
    const textos = [];
    const caminante = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let t = /** @type {Text | null} */ (caminante.nextNode()); t; t = /** @type {Text | null} */ (caminante.nextNode())) {
      if (rango.intersectsNode(t)) textos.push(t);
    }
    for (const t of textos) {
      const desde = t === rango.startContainer ? rango.startOffset : 0;
      const hasta = t === rango.endContainer ? rango.endOffset : t.length;
      if (hasta <= desde) continue;
      const medio = desde > 0 ? t.splitText(desde) : t;
      if (hasta - desde < medio.length) medio.splitText(hasta - desde);
      const marca = doc.createElement('span');
      marca.className = m.activa ? 'comentado comentado-activo' : 'comentado';
      medio.replaceWith(marca);
      marca.appendChild(medio);
    }
  }
}
