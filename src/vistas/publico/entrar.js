import { aviso, h } from '../../dom.js';

export function render() {
  return h(
    'section',
    {},
    h('h1', { tabindex: '-1' }, 'Entrar'),
    aviso('info', 'El inicio de sesión todavía no está disponible.'),
  );
}
