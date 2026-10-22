// Comandos de Markdown del editor (bloque O): los mismos en los atajos de teclado, en el menú "/" y en la
// paleta Ctrl+K. Cada uno es un cambio de CodeMirror (va a Yjs como cualquier edición y se deshace con
// Ctrl+Z, solo lo propio).
import { EditorSelection } from '@codemirror/state';

/**
 * @typedef {import('@codemirror/view').EditorView} EditorView
 * @typedef {{ id: string, nombre: string, palabras: string, atajo?: string, bloque: boolean, aplicar: (v: EditorView) => boolean }} Comando
 */

/** Envuelve cada selección con `marca` (o la quita si ya la tiene); sin selección, deja el cursor en medio. */
export const envolver = (/** @type {string} */ marca) => (/** @type {EditorView} */ v) => {
  v.dispatch(
    v.state.changeByRange((r) => {
      const antes = v.state.sliceDoc(r.from - marca.length, r.from);
      const despues = v.state.sliceDoc(r.to, r.to + marca.length);
      if (antes === marca && despues === marca) {
        return {
          changes: [{ from: r.from - marca.length, to: r.from }, { from: r.to, to: r.to + marca.length }],
          range: EditorSelection.range(r.from - marca.length, r.to - marca.length),
        };
      }
      return {
        changes: [{ from: r.from, insert: marca }, { from: r.to, insert: marca }],
        range: EditorSelection.range(r.from + marca.length, r.to + marca.length),
      };
    }),
    { userEvent: 'input' },
  );
  return true;
};

/** Pone (o cambia) el prefijo de cada línea seleccionada: "# ", "- ", "> "... */
export const prefijo = (/** @type {string} */ marca) => (/** @type {EditorView} */ v) => {
  const PREFIJOS = /^(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+\. |> )/;
  /** @type {{ from: number, to: number, insert: string }[]} */
  const cambios = [];
  const vistas = new Set();
  for (const r of v.state.selection.ranges) {
    for (let n = v.state.doc.lineAt(r.from).number; n <= v.state.doc.lineAt(r.to).number; n++) {
      if (vistas.has(n)) continue;
      vistas.add(n);
      const linea = v.state.doc.line(n);
      const actual = PREFIJOS.exec(linea.text)?.[0] ?? '';
      cambios.push({ from: linea.from, to: linea.from + actual.length, insert: actual === marca ? '' : marca });
    }
  }
  v.dispatch({ changes: cambios, userEvent: 'input' });
  return true;
};

/** Inserta un bloque en una línea propia; `cursor` es dónde queda el cursor dentro del bloque. */
export const bloque = (/** @type {string} */ texto, /** @type {number} */ cursor) => (/** @type {EditorView} */ v) => {
  const r = v.state.selection.main;
  const linea = v.state.doc.lineAt(r.from);
  const antes = linea.text.trim() === '' ? '' : '\n\n';
  v.dispatch({ changes: { from: r.to, insert: antes + texto }, selection: { anchor: r.to + antes.length + cursor }, userEvent: 'input' });
  return true;
};

/** Enlace: la selección es el texto del enlace; el cursor queda en la dirección. */
const enlace = (/** @type {EditorView} */ v) => {
  const r = v.state.selection.main;
  const texto = v.state.sliceDoc(r.from, r.to) || 'texto';
  const insertar = `[${texto}](https://)`;
  v.dispatch({ changes: { from: r.from, to: r.to, insert: insertar }, selection: { anchor: r.from + insertar.length - 1 }, userEvent: 'input' });
  return true;
};

const TABLA = '| Columna | Columna |\n| --- | --- |\n| | |\n';

/** @type {Comando[]} */
export const COMANDOS = [
  { id: 'titulo1', nombre: 'Título 1', palabras: 'titulo encabezado h1', bloque: true, aplicar: prefijo('# ') },
  { id: 'titulo2', nombre: 'Título 2', palabras: 'titulo encabezado h2 subtitulo', bloque: true, aplicar: prefijo('## ') },
  { id: 'titulo3', nombre: 'Título 3', palabras: 'titulo encabezado h3', bloque: true, aplicar: prefijo('### ') },
  { id: 'negrita', nombre: 'Negrita', palabras: 'negrita fuerte bold', atajo: 'Mod-b', bloque: false, aplicar: envolver('**') },
  { id: 'cursiva', nombre: 'Cursiva', palabras: 'cursiva enfasis italic', atajo: 'Mod-i', bloque: false, aplicar: envolver('_') },
  { id: 'codigo', nombre: 'Código en línea', palabras: 'codigo code', atajo: 'Mod-e', bloque: false, aplicar: envolver('`') },
  { id: 'tachado', nombre: 'Tachado', palabras: 'tachado strike', atajo: 'Mod-Shift-x', bloque: false, aplicar: envolver('~~') },
  { id: 'enlace', nombre: 'Enlace', palabras: 'enlace link url', bloque: false, aplicar: enlace },
  { id: 'lista', nombre: 'Lista', palabras: 'lista viñetas', bloque: true, aplicar: prefijo('- ') },
  { id: 'numerada', nombre: 'Lista numerada', palabras: 'lista numerada ordenada', bloque: true, aplicar: prefijo('1. ') },
  { id: 'tarea', nombre: 'Lista de tareas', palabras: 'tarea casilla checklist', bloque: true, aplicar: prefijo('- [ ] ') },
  { id: 'cita', nombre: 'Cita', palabras: 'cita quote', bloque: true, aplicar: prefijo('> ') },
  { id: 'bloque-codigo', nombre: 'Bloque de código', palabras: 'bloque codigo code fence', bloque: true, aplicar: bloque('```\n\n```\n', 4) },
  { id: 'tabla', nombre: 'Tabla', palabras: 'tabla table', bloque: true, aplicar: bloque(TABLA, 2) },
  { id: 'linea', nombre: 'Línea horizontal', palabras: 'linea separador hr', bloque: true, aplicar: bloque('---\n', 4) },
];

/** Texto legible de un atajo de CodeMirror ("Mod-Shift-x" → "Ctrl+Mayús+X"). */
export function atajoLegible(/** @type {string} */ atajo, esMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')) {
  return atajo
    .split('-')
    .map((p) => ({ Mod: esMac ? '⌘' : 'Ctrl', Shift: 'Mayús', Alt: 'Alt' })[p] ?? p.toUpperCase())
    .join('+');
}

/** Para buscar sin acentos ni mayúsculas. */
export const normalizar = (/** @type {string} */ s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Los comandos que coinciden con lo escrito (en el nombre o en sus palabras clave).
 * @template {{ nombre: string, palabras: string }} T
 * @param {T[]} comandos @param {string} consulta
 * @returns {T[]}
 */
export function filtrar(comandos, consulta) {
  const q = normalizar(consulta.trim());
  if (!q) return comandos;
  return comandos.filter((c) => normalizar(`${c.nombre} ${c.palabras}`).includes(q));
}
