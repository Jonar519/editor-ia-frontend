// Tu cuenta → Sesiones: dónde está abierta la cuenta (red truncada y ubicación aproximada: el backend
// nunca guarda la IP completa), cerrar una, o cerrar todas las demás. Cerrar la de ESTE dispositivo es
// salir: se usa el mismo cierre que el botón "Salir" (borra también la cookie de refresco).
import { ErrorApi, mensajeParaPersona } from '../../api/errores.js';
import { anunciar } from '../../componentes/anunciar.js';
import { conDatos } from '../../componentes/estado.js';
import { salirConAviso } from '../../componentes/salir.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { fechaHora, paginaCuenta } from './comun.js';

/**
 * @typedef {{
 *   id: string, actual: boolean, creadaEn: string, ultimoUsoEn: string, expiraEn: string,
 *   ipRed: string | null, ubicacion: string | null, userAgent: string | null, mfaVerificada: boolean
 * }} Sesion
 */

export function render() {
  const lugar = h('div', {});
  const seccion = paginaCuenta('/cuenta/sesiones', 'Sesiones abiertas', h('p', {}, 'Si ves una sesión que no reconoces, ciérrala y cambia tu contraseña.'), lugar);
  /** @param {string} [mensaje] anunciado después de recargar */
  const cargar = (mensaje) => {
    lugar.replaceChildren(
      conDatos({
        queCarga: 'tus sesiones',
        cargar: (senal) => /** @type {Promise<{ sesiones: Sesion[] }>} */ (api.solicitar('/cuenta/sesiones', { senal })),
        mostrar: (r) => lista(r.sesiones, cargar, mensaje),
      }),
    );
  };
  cargar();
  return seccion;
}

/**
 * @param {Sesion[]} sesiones
 * @param {(mensaje?: string) => void} recargar
 * @param {string} [mensaje]
 */
function lista(sesiones, recargar, mensaje) {
  const salida = h('div', {}, mensaje ? aviso('exito', mensaje) : null);
  if (mensaje) anunciar(mensaje);
  const otras = sesiones.filter((s) => !s.actual).length;
  const titulo = h('h2', { tabindex: '-1' }, `${String(sesiones.length)} ${sesiones.length === 1 ? 'sesión abierta' : 'sesiones abiertas'}`);

  const cerrarOtras = h('button', { class: 'boton', type: 'button', hidden: otras === 0 }, 'Cerrar todas las demás');
  cerrarOtras.addEventListener('click', () => {
    cerrarOtras.disabled = true;
    api.solicitar('/cuenta/sesiones/cerrar-otras', { metodo: 'POST' }).then(
      (/** @type {{ cerradas: number }} */ r) => recargar(`Cerramos ${String(r.cerradas)} ${r.cerradas === 1 ? 'sesión' : 'sesiones'}.`),
      (/** @type {unknown} */ err) => {
        cerrarOtras.disabled = false;
        salida.replaceChildren(aviso('error', mensajeParaPersona(err)));
      },
    );
  });

  const items = sesiones.map((s) => {
    const idTitulo = `sesion-${s.id}`;
    const boton = h('button', { class: 'boton boton-chico', type: 'button', 'aria-describedby': idTitulo }, s.actual ? 'Salir de esta sesión' : 'Cerrar esta sesión');
    boton.addEventListener('click', () => {
      boton.disabled = true;
      if (s.actual) {
        void salirConAviso().then((salio) => {
          boton.disabled = false;
          if (!salio) return;
          anunciar('Cerraste la sesión.');
          window.location.hash = '#/';
        });
        return;
      }
      api.solicitar(`/cuenta/sesiones/${encodeURIComponent(s.id)}`, { metodo: 'DELETE' }).then(
        () => recargar('Cerramos la sesión.'),
        (/** @type {unknown} */ err) => {
          // Ya estaba cerrada o venció: se recarga la lista igual.
          if (err instanceof ErrorApi && err.codigo === 'sesion_no_encontrada') return recargar('Esa sesión ya estaba cerrada.');
          boton.disabled = false;
          salida.replaceChildren(aviso('error', mensajeParaPersona(err)));
        },
      );
    });
    return h(
      'li',
      { class: 'fila' },
      h('p', { class: 'fila-titulo', id: idTitulo }, s.userAgent ?? 'Navegador desconocido', s.actual ? h('span', { class: 'insignia' }, 'Este dispositivo') : null),
      h(
        'dl',
        { class: 'datos' },
        h('dt', {}, 'Ubicación aproximada'),
        h('dd', {}, s.ubicacion ?? 'Desconocida'),
        h('dt', {}, 'Red'),
        h('dd', {}, s.ipRed ?? 'Desconocida'),
        h('dt', {}, 'Último uso'),
        h('dd', {}, fechaHora(s.ultimoUsoEn)),
        h('dt', {}, 'Abierta'),
        h('dd', {}, fechaHora(s.creadaEn)),
        h('dt', {}, 'Verificación en dos pasos'),
        h('dd', {}, s.mfaVerificada ? 'Sí' : 'No'),
      ),
      boton,
    );
  });

  const contenedor = h('div', {}, titulo, salida, h('p', {}, cerrarOtras), h('ul', { class: 'filas' }, ...items));
  if (mensaje) queueMicrotask(() => titulo.focus());
  return contenedor;
}
