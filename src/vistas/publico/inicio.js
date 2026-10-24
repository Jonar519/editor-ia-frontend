// Inicio público (el "hero"): qué es Cuaderno y una sola acción, Entrar. Quien ya tiene sesión va
// directo a sus documentos. Sin cifras, testimonios ni datos que parezcan reales.
//
// Cada idea dice solo lo que es verdad (revisado en el bloque R, docs/revision-bloque-R.md): las versiones
// se verifican desde el historial («Verificar la cadena»), y el asistente explica, resume, mejora y busca
// por significado. No responde preguntas con citas de otros documentos: eso no existe y no se promete.
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
        h('li', {}, 'Un asistente que explica, resume y mejora tu documentación, y busca por significado en tu espacio.'),
      ),
      h('p', {}, h('a', { class: 'boton boton-primario', href: '#/entrar' }, 'Entrar')),
      h('p', { class: 'suave' }, 'Las cuentas se crean solo por invitación de la administración.'),
    ),
    ilustracion(),
  );
}
