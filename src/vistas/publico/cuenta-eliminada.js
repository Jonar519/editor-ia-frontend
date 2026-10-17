// Después de eliminar la cuenta. Es pública: la sesión ya no existe cuando se muestra.
import { verDespedida } from '../../despedida.js';
import { aviso, h } from '../../dom.js';

const contar = (/** @type {number} */ n, /** @type {string} */ uno, /** @type {string} */ varios) => `${String(n)} ${n === 1 ? uno : varios}`;

export function render() {
  const r = verDespedida();
  return h(
    'section',
    {},
    h('h1', { tabindex: '-1' }, 'Tu cuenta se eliminó'),
    r
      ? aviso(
          'exito',
          r.espaciosBorrados === 0
            ? 'Borramos tu cuenta y tus datos personales. No había espacios donde fueras el único miembro.'
            : `Borramos tu cuenta, tus datos personales, ${contar(r.espaciosBorrados, 'espacio', 'espacios')} donde eras el único miembro y ${contar(r.documentosBorrados, 'documento', 'documentos')} de esos espacios.`,
        )
      : h('p', {}, 'Esta página aparece después de eliminar una cuenta.'),
    h('p', {}, h('a', { href: '#/' }, 'Ir al inicio')),
  );
}
