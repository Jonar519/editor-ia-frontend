// Menú "/" del editor (bloque O): al escribir "/" al principio de una línea (o después de un espacio), una
// lista de comandos de Markdown que se filtra mientras se escribe (por el nombre y por palabras clave:
// "/h1", "/tabla", "/code"). Es el autocompletado de CodeMirror: su lista ya sigue el patrón accesible
// (listbox con aria-activedescendant), se navega con las flechas, Enter elige y Escape cierra. Al elegir,
// el "/palabra" se borra y se aplica el comando.
import { autocompletion } from '@codemirror/autocomplete';
import { COMANDOS, atajoLegible, filtrar } from './comandos.js';

/** Entradas de IA del menú (bloque Q): las pone el editor; aplicarlas carga la IA bajo demanda. */
/** @typedef {{ id: string, nombre: string, palabras: string, aplicar: () => void }} ExtraBarra */

/**
 * @param {import('@codemirror/autocomplete').CompletionContext} ctx
 * @param {() => ExtraBarra[]} [extras]
 */
export function fuenteBarra(ctx, extras = () => []) {
  const m = ctx.matchBefore(/(?:^|\s)\/[\p{L}\d-]*$/u);
  if (!m) return null;
  const desde = m.from + m.text.indexOf('/');
  const consulta = ctx.state.sliceDoc(desde + 1, ctx.pos);
  const deIa = filtrar(extras(), consulta).map((c) => ({
    label: c.nombre,
    section: 'IA',
    apply: (/** @type {import('@codemirror/view').EditorView} */ v, /** @type {unknown} */ _c, /** @type {number} */ from, /** @type {number} */ to) => {
      v.dispatch({ changes: { from, to }, selection: { anchor: from } });
      c.aplicar();
    },
  }));
  return {
    from: desde,
    // El filtro es propio (nombre y palabras clave), no el de CodeMirror.
    filter: false,
    options: [...filtrar(COMANDOS, consulta).map((c) => ({
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
    })), ...deIa],
  };
}

/** La extensión: solo esta fuente, sin íconos, activa al escribir. */
export const menuBarra = autocompletion({ override: [(ctx) => fuenteBarra(ctx)], icons: false, activateOnTyping: true, closeOnBlur: true });

/** La misma, con entradas extra (las de IA del editor). */
export const menuBarraCon = (/** @type {() => ExtraBarra[]} */ extras) =>
  autocompletion({ override: [(ctx) => fuenteBarra(ctx, extras)], icons: false, activateOnTyping: true, closeOnBlur: true });
