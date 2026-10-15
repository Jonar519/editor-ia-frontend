import { h } from '../../dom.js';

export function render() {
  return h(
    'section',
    {},
    h('h1', { tabindex: '-1' }, 'Cuaderno'),
    h('p', {}, 'Documentación técnica escrita en equipo, con historial de versiones y un asistente de IA.'),
    h('p', {}, h('a', { class: 'boton boton-primario', href: '#/entrar' }, 'Entrar')),
    h('p', { class: 'suave' }, 'Las cuentas se crean solo por invitación de la administración.'),
  );
}
