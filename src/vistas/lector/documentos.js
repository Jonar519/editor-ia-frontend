import { h } from '../../dom.js';

export function render() {
  return h('section', {}, h('h1', { tabindex: '-1' }, 'Documentos'), h('p', { class: 'suave' }, 'Todavía no hay documentos.'));
}
