// Salir de la cuenta sin perder en silencio lo escrito sin conexión (decisión del inicio del bloque N): si
// hay cambios que no llegaron al servidor, se avisa cuántos y se elige entre cancelar y salir borrándolos.
// Salir borra la copia local (equipos compartidos), así que esos cambios se perderían.
import { h } from '../dom.js';
import { cerrarSesion } from '../sesion.js';
import { contarSinEnviar } from '../tiempo-real/borrar-local.js';

/** "8 cambios sin enviar (en 1 documento)" */
export function textoSinEnviar(/** @type {number} */ cambios, /** @type {number} */ documentos) {
  const c = cambios === 1 ? '1 cambio sin enviar' : `${String(cambios)} cambios sin enviar`;
  const d = documentos === 1 ? '1 documento' : `${String(documentos)} documentos`;
  return `${c} (en ${d})`;
}

/**
 * Pregunta con un diálogo modal. Devuelve true si se elige salir. Escape o "Cancelar": false.
 * @param {number} cambios @param {number} documentos
 * @returns {Promise<boolean>}
 */
function confirmarSalida(cambios, documentos) {
  const cancelar = h('button', { type: 'button', class: 'boton' }, 'Cancelar');
  const salir = h('button', { type: 'button', class: 'boton boton-peligro' }, 'Salir y borrar esos cambios');
  const dialogo = h(
    'dialog',
    { class: 'dialogo', role: 'alertdialog', 'aria-labelledby': 'salir-titulo', 'aria-describedby': 'salir-texto' },
    h('h2', { id: 'salir-titulo' }, `Tienes ${textoSinEnviar(cambios, documentos)}`),
    h(
      'p',
      { id: 'salir-texto' },
      'Los escribiste sin conexión y todavía no llegaron al servidor. Si sales ahora, se borran de este dispositivo y se pierden. Para conservarlos, cancela y espera a tener conexión.',
    ),
    h('p', { class: 'acciones' }, cancelar, salir),
  );
  document.body.append(dialogo);
  return new Promise((resolver) => {
    const terminar = (/** @type {boolean} */ si) => {
      dialogo.close();
      dialogo.remove();
      resolver(si);
    };
    cancelar.addEventListener('click', () => terminar(false));
    salir.addEventListener('click', () => terminar(true));
    dialogo.addEventListener('cancel', (ev) => {
      ev.preventDefault();
      terminar(false);
    });
    dialogo.showModal();
    // El foco empieza en la opción que NO pierde nada.
    cancelar.focus();
  });
}

/**
 * Cierra la sesión, avisando antes si hay cambios sin enviar. Devuelve true si salió.
 * @param {{ contar?: typeof contarSinEnviar }} [o]
 */
export async function salirConAviso(o = {}) {
  const { cambios, documentos } = await (o.contar ?? contarSinEnviar)();
  if (cambios > 0 && !(await confirmarSalida(cambios, documentos))) return false;
  await cerrarSesion();
  return true;
}
