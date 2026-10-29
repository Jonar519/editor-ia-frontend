// ¿Se puede escribir en el editor? (R10). Dos cosas lo impiden:
//   - el rol que manda el servidor no es de edición. Si el rol baja a lector, el servidor cierra con 4403
//     y el ticket nuevo trae el rol: llega por ponerRol;
//   - la conexión terminó sin acceso o con el documento borrado. Eso no tiene vuelta en esta página:
//     aunque después llegara un rol de edición, el editor sigue de solo lectura.
// Al terminar la sesión (sesion-terminada) el editor SIGUE editable a propósito (bloque M): lo que se
// escribe queda en la copia del dispositivo y se envía al volver a entrar.
//
// El readOnly de CodeMirror no alcanza: no frena los comandos propios (atajos de Markdown, el Enter de las
// listas) ni el deshacer de Yjs, que cambia el Y.Text directamente. Por eso, sin permiso:
//   - el filtro descarta todo cambio que no venga del documento compartido (ySyncAnnotation: lo que
//     escriben los demás, y lo que aplica el deshacer de Yjs cuando sí se puede);
//   - los atajos que editan (deshacer incluido) no hacen nada, y se consumen para que el navegador tampoco;
//   - el deshacer y el rehacer del navegador (beforeinput historyUndo/historyRedo, que yCollab convierte en
//     el deshacer de Yjs) se cancelan. Chromium los manda al editor aunque el foco ya no esté en él.
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ySyncAnnotation } from 'y-codemirror.next';

/** Estados de la conexión que dejan el editor de solo lectura hasta salir de la página. */
export const ESTADOS_SIN_EDICION = ['sin-acceso', 'borrado'];

export const escribe = (/** @type {string} */ rol) => rol === 'editor' || rol === 'propietario';

/**
 * @typedef {{ puede: boolean, cortado: boolean }} EstadoPermiso
 *   cortado: la conexión terminó sin acceso o con el documento borrado
 */

/**
 * @param {string} rolInicial el rol con que se abrió el documento
 * @param {(e: EstadoPermiso) => void} alCambio cada vez que el rol o la conexión cambian lo que se puede
 */
export function permisoEditor(rolInicial, alCambio) {
  let rol = rolInicial;
  let cortado = false;
  const puede = () => !cortado && escribe(rol);
  /** @returns {EstadoPermiso} */
  const estado = () => ({ puede: puede(), cortado });
  return {
    puede,
    estado,
    /** El rol con que actúa el resto de la página (la IA, los comentarios): lector si se cortó. */
    rol: () => (cortado ? 'lector' : rol),
    /** @param {string} nuevo el rol que mandó el servidor */
    ponerRol(nuevo) {
      rol = nuevo;
      alCambio(estado());
    },
    /** @param {import('../../tiempo-real/conexion.js').EstadoRed} e */
    ponerEstadoRed(e) {
      if (cortado || !ESTADOS_SIN_EDICION.includes(e)) return;
      cortado = true;
      alCambio(estado());
    },
  };
}

/** @typedef {{ puede: () => boolean }} ConPermiso */

/**
 * Sin permiso, solo pasan los cambios del documento compartido, y el deshacer del navegador se cancela.
 * Va ANTES de yCollab en las extensiones, para que su beforeinput corra primero.
 * @param {ConPermiso} p
 */
export function filtroSinPermiso(p) {
  return [
    EditorState.changeFilter.of((tr) => p.puede() || tr.annotation(ySyncAnnotation) !== undefined),
    EditorView.domEventHandlers({ beforeinput: deshacerSinPermiso(p) }),
  ];
}

/** El beforeinput del deshacer y el rehacer: sin permiso, se cancela. @param {ConPermiso} p */
export function deshacerSinPermiso(p) {
  return (/** @type {InputEvent} */ e) => {
    if (p.puede() || (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo')) return false;
    e.preventDefault();
    return true;
  };
}

/**
 * Atajos que editan: sin permiso no hacen nada (y se consumen).
 * @template {{ run?: (v: import('@codemirror/view').EditorView) => boolean }} K
 * @param {ConPermiso} p @param {readonly K[]} atajos
 * @returns {K[]}
 */
export function atajosConPermiso(p, atajos) {
  return atajos.map((k) => {
    const run = k.run;
    return run ? { ...k, run: (/** @type {import('@codemirror/view').EditorView} */ v) => (p.puede() ? run(v) : true) } : k;
  });
}
