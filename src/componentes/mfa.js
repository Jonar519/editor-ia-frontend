// Piezas de la verificación en dos pasos que usan la invitación (cuenta admin) y "Tu cuenta":
//   - el secreto en grupos de 4 con el enlace otpauth:// (sin QR: ver docs/revision-bloque-R.md);
//   - los 10 códigos de respaldo, que se muestran UNA sola vez, con copiar, descargar y una casilla
//     "ya los guardé" antes de continuar. Avisa si se intenta salir sin confirmarlo.
import { aviso, h } from '../dom.js';

/** Secreto base32 en grupos de 4 para leerlo y escribirlo sin errores. */
export const enGrupos = (/** @type {string} */ secreto) => secreto.replace(/(.{4})/g, '$1 ').trim();

/**
 * @param {{ secreto: string, uri: string }} m
 * @returns {HTMLElement[]}
 */
export function bloqueSecreto(m) {
  return [
    h('p', { class: 'codigo-secreto' }, enGrupos(m.secreto)),
    h('p', {}, h('a', { href: m.uri }, 'Abrir en la app autenticadora'), h('span', { class: 'suave' }, ' (desde el teléfono)')),
  ];
}

/**
 * Reemplaza el contenido de `seccion` por los códigos. `alContinuar` se llama cuando la persona confirma
 * que los guardó (ya sin el aviso de salida).
 * @param {HTMLElement} seccion
 * @param {string[]} codigos
 * @param {{ alContinuar: () => void, nivelTitulo?: 'h1' | 'h2' }} o
 */
export function mostrarCodigos(seccion, codigos, o) {
  const texto = ['Códigos de respaldo de Cuaderno (cada uno sirve una sola vez):', '', ...codigos].join('\n');
  /** @param {BeforeUnloadEvent} ev */
  const alSalir = (ev) => {
    ev.preventDefault();
  };
  window.addEventListener('beforeunload', alSalir);

  const copiar = h('button', { class: 'boton', type: 'button' }, 'Copiar');
  const estadoCopia = h('span', { class: 'suave', role: 'status' });
  copiar.addEventListener('click', () => {
    navigator.clipboard.writeText(texto).then(
      () => {
        estadoCopia.textContent = 'Copiados.';
      },
      () => {
        estadoCopia.textContent = 'No se pudieron copiar: selecciónalos y cópialos a mano.';
      },
    );
  });
  const descargar = h('a', { class: 'boton', download: 'cuaderno-codigos-de-respaldo.txt', href: URL.createObjectURL(new Blob([texto], { type: 'text/plain' })) }, 'Descargar .txt');

  const confirmo = h('input', { type: 'checkbox', id: 'codigos-guardados' });
  const seguir = h('button', { class: 'boton boton-primario', type: 'button', disabled: true }, 'Continuar');
  confirmo.addEventListener('change', () => {
    seguir.disabled = !confirmo.checked;
  });
  seguir.addEventListener('click', () => {
    window.removeEventListener('beforeunload', alSalir);
    URL.revokeObjectURL(descargar.href);
    o.alContinuar();
  });

  const titulo = h(o.nivelTitulo ?? 'h1', { tabindex: '-1' }, 'Guarda tus códigos de respaldo');
  seccion.replaceChildren(
    titulo,
    aviso('advertencia', 'Se muestran solo esta vez. Si pierdes el teléfono, son la única forma de entrar.'),
    h('ul', { class: 'codigos-respaldo', 'aria-label': 'Códigos de respaldo' }, ...codigos.map((c) => h('li', {}, c))),
    h('p', { class: 'acciones' }, copiar, descargar, estadoCopia),
    h('p', {}, confirmo, h('label', { for: 'codigos-guardados' }, ' Ya los guardé en un lugar seguro')),
    seguir,
  );
  titulo.focus();
}
