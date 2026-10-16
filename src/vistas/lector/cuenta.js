// Tu cuenta (solo lectura por ahora; editar perfil, sesiones y datos llegan en bloques siguientes).
// Usa el componente de estados: cargando, error con "Reintentar" (sin recargar) y el perfil.
import { conDatos } from '../../componentes/estado.js';
import { h } from '../../dom.js';
import { api } from '../../sesion.js';

const ROLES = { admin: 'Administración', editor: 'Edición', lector: 'Lectura' };

/**
 * @typedef {{ nombre: string, correo: string, rol: 'admin' | 'editor' | 'lector', mfaActivo: boolean, telefono: string | null }} Perfil
 */

export function render() {
  return h(
    'section',
    {},
    h('h1', { tabindex: '-1' }, 'Tu cuenta'),
    conDatos({
      queCarga: 'tu perfil',
      cargar: (senal) => /** @type {Promise<Perfil>} */ (api.solicitar('/cuenta', { senal })),
      mostrar: (p) =>
        h(
          'dl',
          { class: 'datos' },
          h('dt', {}, 'Nombre'),
          h('dd', {}, p.nombre),
          h('dt', {}, 'Correo'),
          h('dd', {}, p.correo),
          h('dt', {}, 'Permisos'),
          h('dd', {}, ROLES[p.rol]),
          h('dt', {}, 'Verificación en dos pasos'),
          h('dd', {}, p.mfaActivo ? 'Activa' : 'No activa'),
        ),
    }),
  );
}
