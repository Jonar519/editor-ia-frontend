import { h } from '../../dom.js';

/** @param {Record<string, string>} params */
export function render(params) {
  return h('section', {}, h('h1', { tabindex: '-1' }, 'Editar documento'), h('p', { class: 'suave' }, `Documento ${params.id ?? ''}`));
}
