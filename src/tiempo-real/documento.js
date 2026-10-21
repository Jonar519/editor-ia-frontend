// Un documento en vivo en el navegador: el Y.Doc, la presencia y la conexión, para la vista de lectura y
// el editor. Se cierra solo al salir de la vista (cambia la ruta) o al cerrar la página.
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { api } from '../sesion.js';
import { conectarDocumento } from './conexion.js';
import { normalizarPresencia } from './presencia.js';

/** El único texto del documento (ADR 0003 del backend). */
export const NOMBRE_TEXTO = 'contenido';

/**
 * @param {{
 *   documentoId: string,
 *   alEstado: (e: import('./conexion.js').EstadoRed) => void,
 *   alRol?: (rol: string) => void,
 *   ventana?: Window,
 * }} o
 */
export function abrirDocumento(o) {
  const w = o.ventana ?? window;
  const doc = new Y.Doc();
  const presencia = new Awareness(doc);
  // Antes que cualquier oyente que dibuje (el editor): ver presencia.js.
  const dejarDeNormalizar = normalizarPresencia(presencia);
  // El estado local va vacío: el servidor le pone la cuenta y el nombre; el editor, el cursor.
  presencia.setLocalState({});
  const conexion = conectarDocumento({ documentoId: o.documentoId, doc, presencia, api, alEstado: o.alEstado, alRol: o.alRol });

  const hash = w.location.hash;
  const cerrar = () => {
    w.removeEventListener('hashchange', alCambiarRuta);
    w.removeEventListener('pagehide', cerrar);
    conexion.cerrar();
    dejarDeNormalizar();
    presencia.destroy();
    doc.destroy();
  };
  const alCambiarRuta = () => {
    if (w.location.hash !== hash) cerrar();
  };
  w.addEventListener('hashchange', alCambiarRuta);
  w.addEventListener('pagehide', cerrar);

  return { doc, texto: doc.getText(NOMBRE_TEXTO), presencia, cerrar };
}
