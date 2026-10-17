// Inicio público (el "hero"): qué es Cuaderno y una sola acción, Entrar. Quien ya tiene sesión va
// directo a sus documentos. Sin cifras, testimonios ni datos que parezcan reales.
//
// REVISIÓN DEL BLOQUE R: la 2.ª y la 3.ª idea describen funciones que todavía no existen (versiones
// verificables: bloques N y Q; asistente con tu documentación: bloques P2 y Q). Ver
// docs/revision-bloque-R.md: hay que confirmar que son verdad antes de entregar.
import { h } from '../../dom.js';
import { api, DESTINO_POR_DEFECTO } from '../../sesion.js';
import { ilustracion } from './ilustracion.js';

export function render() {
  if (api.usuario()) {
    window.location.replace(`#${DESTINO_POR_DEFECTO}`);
    return h('p', { class: 'cargando', role: 'status' }, 'Abriendo tus documentos…');
  }
  return h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-texto' },
      h('h1', { tabindex: '-1' }, 'Cuaderno'),
      h('p', { class: 'hero-frase' }, 'Documentación técnica escrita en equipo.'),
      h(
        'ul',
        { class: 'hero-ideas' },
        h('li', {}, 'Escriban juntos, en tiempo real.'),
        h('li', {}, 'Cada versión queda guardada y se puede verificar.'),
        h('li', {}, 'Un asistente que responde con tu propia documentación.'),
      ),
      h('p', {}, h('a', { class: 'boton boton-primario', href: '#/entrar' }, 'Entrar')),
      h('p', { class: 'suave' }, 'Las cuentas se crean solo por invitación de la administración.'),
    ),
    ilustracion(),
  );
}
