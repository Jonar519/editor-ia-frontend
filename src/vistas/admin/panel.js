import { h } from '../../dom.js';

export function render() {
  return h('section', {}, h('h1', { tabindex: '-1' }, 'Administración'), h('p', { class: 'suave' }, 'Invitaciones y cuentas.'));
}
