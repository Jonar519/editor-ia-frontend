// Menú "/" del editor (bloque O): al escribir "/" al principio de una línea (o después de un espacio), una
// lista de comandos de Markdown que se filtra mientras se escribe (por el nombre y por palabras clave:
// "/h1", "/tabla", "/code"). Es el autocompletado de CodeMirror: su lista ya sigue el patrón accesible
// (listbox con aria-activedescendant), se navega con las flechas, Enter elige y Escape cierra. Al elegir,
// el "/palabra" se borra y se aplica el comando.
import { autocompletion } from '@codemirror/autocomplete';
import { COMANDOS, atajoLegible, filtrar } from './comandos.js';

/** @param {import('@codemirror/autocomplete').CompletionContext} ctx */
export function fuenteBarra(ctx) {
  const m = ctx.matchBefore(/(?:^|\s)\/[\p{L}\d-]*$/u);
  if (!m) return null;
  const desde = m.from + m.text.indexOf('/');
  const consulta = ctx.state.sliceDoc(desde + 1, ctx.pos);
  return {
    from: desde,
    // El filtro es propio (nombre y palabras clave), no el de CodeMirror.
    filter: false,
    options: filtrar(COMANDOS, consulta).map((c) => ({
      label: c.nombre,
      detail: c.atajo ? atajoLegible(c.atajo) : undefined,
      section: c.bloque ? 'Bloques' : 'Texto',
      apply: (
        /** @type {import('@codemirror/view').EditorView} */ v,
        /** @type {unknown} */ _completado,
        /** @type {number} */ from,
        /** @type {number} */ to,
      ) => {
        v.dispatch({ changes: { from, to }, selection: { anchor: from } });
        c.aplicar(v);
      },
    })),
  };
}

/** La extensión: solo esta fuente, sin íconos, activa al escribir. */
export const menuBarra = autocompletion({ override: [fuenteBarra], icons: false, activateOnTyping: true, closeOnBlur: true });
