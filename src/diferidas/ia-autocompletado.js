// Autocompletado con la IA en el editor (bloque Q; decisión escrita: desactivado por defecto, interruptor
// SOLO en memoria). Va por el WebSocket del documento: ia.autocompletar { pedido, antes, despues } →
// ia.sugerencia { pedido, texto | error }.
//
//   - Se pide tras ESPERA_MS sin escribir, con el cursor sin selección. Cada pedido lleva un número; una
//     sugerencia que no es la del ÚLTIMO pedido, o que llega cuando el texto o el cursor ya cambiaron,
//     se ignora.
//   - El texto fantasma es una decoración (no está en el documento): --color-ia-sugerencia y cursiva, y
//     aria-hidden. Tab lo acepta (lo escribe como un cambio normal del editor); Escape lo descarta. Sin
//     sugerencia, Tab sale del editor como siempre (WCAG 2.1.2).
//   - Lectores de pantalla: un anuncio "Sugerencia de la IA disponible…". NO se repite mientras se sigue
//     escribiendo: vuelve a anunciarse solo después de aceptar, descartar o salir del editor.
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view';

export const ESPERA_MS = 400;
/** Contexto que se manda (el backend vuelve a recortar a 2000 y 500). */
export const CONTEXTO = { antes: 2000, despues: 500 };
export const ANUNCIO = 'Sugerencia de la IA disponible: Tab para aceptarla, Escape para descartarla.';

/** Lo de antes y lo de después del cursor, recortado. */
export function contexto(/** @type {string} */ texto, /** @type {number} */ pos) {
  return { antes: texto.slice(Math.max(0, pos - CONTEXTO.antes), pos), despues: texto.slice(pos, pos + CONTEXTO.despues) };
}

/** Anuncia una vez; no repite hasta `rearmar()` (aceptar, descartar o salir del editor). */
export function crearAnunciador(/** @type {(texto: string) => void} */ anunciar) {
  let anunciado = false;
  return {
    quizas() {
      if (anunciado) return false;
      anunciado = true;
      anunciar(ANUNCIO);
      return true;
    },
    rearmar() {
      anunciado = false;
    },
  };
}

/** @typedef {{ pos: number, texto: string }} Fantasma */
/** @typedef {{ pedido: number, pos: number, doc: import('@codemirror/state').Text }} Esperado */

/** @type {import('@codemirror/state').StateEffectType<Fantasma>} */
export const poner = StateEffect.define();
/** @type {import('@codemirror/state').StateEffectType<null>} */
const quitar = StateEffect.define();

/**
 * ¿Se muestra esta sugerencia? Solo si es la del ÚLTIMO pedido, trae texto, y el documento y el cursor
 * siguen exactamente como cuando se pidió (si no, llegó tarde y se ignora).
 * @param {Record<string, unknown>} c el mensaje ia.sugerencia
 * @param {Esperado} esperado
 * @param {import('@codemirror/state').EditorState} estado
 */
export function vigente(c, esperado, estado) {
  const s = estado.selection.main;
  return c.pedido === esperado.pedido && typeof c.texto === 'string' && c.texto !== '' && estado.doc === esperado.doc && s.empty && s.head === esperado.pos;
}

class Widget extends WidgetType {
  constructor(/** @type {string} */ texto) {
    super();
    this.texto = texto;
  }
  eq(/** @type {Widget} */ otro) {
    return otro.texto === this.texto;
  }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'sugerencia-ia';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = this.texto;
    return s;
  }
  ignoreEvent() {
    return true;
  }
}

/** El texto fantasma visible (o null). Cualquier cambio del texto o del cursor lo quita. */
export const campo = StateField.define({
  /** @returns {Fantasma | null} */
  create: () => null,
  update(valor, tr) {
    for (const e of tr.effects) {
      if (e.is(poner)) return e.value;
      if (e.is(quitar)) return null;
    }
    return tr.docChanged || tr.selection ? null : valor;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (v) => (v ? Decoration.set([Decoration.widget({ widget: new Widget(v.texto), side: 1 }).range(v.pos)]) : Decoration.none)),
});

/** @typedef {{ state: import('@codemirror/state').EditorState, dispatch: (tr: import('@codemirror/state').TransactionSpec) => void }} VistaMinima */

/**
 * Tab: escribe la sugerencia como un cambio normal del editor. Sin sugerencia, false (Tab sale del editor).
 * @param {VistaMinima} v
 */
export function aceptar(v) {
  const f = v.state.field(campo, false);
  if (!f) return false;
  v.dispatch({ changes: { from: f.pos, insert: f.texto }, selection: { anchor: f.pos + f.texto.length }, effects: quitar.of(null), userEvent: 'input.ia' });
  return true;
}

/**
 * Escape: quita la sugerencia sin tocar el documento. Sin sugerencia, false (Escape sigue su camino).
 * @param {VistaMinima} v
 */
export function descartar(v) {
  if (!v.state.field(campo, false)) return false;
  v.dispatch({ effects: quitar.of(null) });
  return true;
}

/**
 * @param {{
 *   control: { enviar: (m: unknown) => boolean, oir: (f: (c: Record<string, unknown>) => void) => () => void },
 *   anunciar: (texto: string) => void,
 *   alError: (codigo: string) => void,
 *   esperaMs?: number,
 * }} o
 */
export function crearAutocompletado(o) {
  const anunciador = crearAnunciador(o.anunciar);
  let ultimo = 0;
  /** @type {Esperado | null} */
  let esperado = null;
  /** @type {EditorView | null} */
  let vista = null;

  const dejarDeOir = o.control.oir((c) => {
    if (c.tipo !== 'ia.sugerencia' || !vista || !esperado || c.pedido !== esperado.pedido) return;
    const v = vista;
    const e = esperado;
    esperado = null;
    if (typeof c.error === 'string') {
      o.alError(c.error);
      return;
    }
    if (!vigente(c, e, v.state)) return;
    v.dispatch({ effects: poner.of({ pos: e.pos, texto: /** @type {string} */ (c.texto) }) });
    anunciador.quizas();
  });

  const plugin = ViewPlugin.fromClass(
    class {
      /** @param {EditorView} v */
      constructor(v) {
        vista = v;
        /** @type {ReturnType<typeof setTimeout> | null} */
        this.t = null;
      }
      /** @param {import('@codemirror/view').ViewUpdate} u */
      update(u) {
        if (u.focusChanged && !u.view.hasFocus) {
          anunciador.rearmar();
          esperado = null;
        }
        if (!u.docChanged || !u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'))) return;
        esperado = null;
        if (this.t) clearTimeout(this.t);
        this.t = setTimeout(() => {
          this.t = null;
          const v = u.view;
          const s = v.state.selection.main;
          if (!s.empty || !v.hasFocus) return;
          const pedido = ++ultimo;
          esperado = { pedido, pos: s.head, doc: v.state.doc };
          o.control.enviar({ tipo: 'ia.autocompletar', pedido, ...contexto(v.state.doc.toString(), s.head) });
        }, o.esperaMs ?? ESPERA_MS);
      }
      destroy() {
        if (this.t) clearTimeout(this.t);
        vista = null;
        esperado = null;
      }
    },
  );

  const teclas = Prec.highest(
    keymap.of([
      {
        key: 'Tab',
        run: (v) => {
          if (!aceptar(v)) return false;
          anunciador.rearmar();
          return true;
        },
      },
      {
        key: 'Escape',
        run: (v) => {
          if (!descartar(v)) return false;
          anunciador.rearmar();
          return true;
        },
      },
    ]),
  );

  return {
    extension: [campo, plugin, teclas],
    destruir: () => {
      dejarDeOir();
      esperado = null;
    },
  };
}
