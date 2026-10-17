// Creación de nodos sin innerHTML: el texto siempre entra como texto, nunca como HTML (sin XSS por
// construcción).

/**
 * @typedef {Node | string | null | undefined | false} Hijo
 */

/**
 * h('p', { class: 'suave' }, 'Hola') → <p class="suave">Hola</p>
 * Los atributos que empiezan con "on" no se aceptan: los eventos se agregan con addEventListener.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} etiqueta
 * @param {Record<string, string | boolean | undefined>} [atributos]
 * @param {...Hijo} hijos
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (/^on/i.test(nombre)) throw new Error(`atributo de evento no permitido: ${nombre}`);
    if (valor === false || valor === undefined) continue;
    el.setAttribute(nombre, valor === true ? '' : valor);
  }
  for (const hijo of hijos) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo);
  }
  return el;
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Lo mismo que h() para SVG (createElementNS). Sin texto: las ilustraciones son formas.
 * @param {string} etiqueta
 * @param {Record<string, string>} [atributos]
 * @param {...SVGElement} hijos
 * @returns {SVGElement}
 */
export function s(etiqueta, atributos = {}, ...hijos) {
  const el = /** @type {SVGElement} */ (document.createElementNS(SVG, etiqueta));
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (/^on/i.test(nombre)) throw new Error(`atributo de evento no permitido: ${nombre}`);
    el.setAttribute(nombre, valor);
  }
  el.append(...hijos);
  return el;
}

/**
 * Aviso de estado. El texto nombra el estado (el color nunca es el único medio).
 * @param {'info' | 'exito' | 'advertencia' | 'error'} tipo
 * @param {string} texto
 */
export function aviso(tipo, texto) {
  const etiqueta = { info: 'Información:', exito: 'Listo:', advertencia: 'Atención:', error: 'Error:' }[tipo];
  return h(
    'div',
    { class: `aviso aviso-${tipo}`, role: tipo === 'error' ? 'alert' : 'status' },
    h('span', { class: 'aviso-etiqueta' }, etiqueta),
    ` ${texto}`,
  );
}
