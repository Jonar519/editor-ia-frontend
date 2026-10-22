// Editar un documento (bloque L; ADR 0004 del backend): CodeMirror 6 + Yjs, con el Markdown como fuente y
// SIN HTML embebido (markdownLanguage, no markdown(): sus analizadores de HTML no se descargan).
//   - Deshacer solo lo propio: el Y.UndoManager de yCollab; no se usa history() de CodeMirror.
//   - Tab NO se captura: sale del editor como de cualquier campo (WCAG 2.1.2). Ctrl+] y Ctrl+[ indentan
//     (defaultKeymap), y la ayuda visible lo dice.
//   - Cursores remotos con el nombre siempre a la vista (presencia.js decide nombre y color).
//   - Si el rol que manda el servidor no permite escribir, el editor queda de solo lectura.
import { defaultKeymap } from '@codemirror/commands';
import { deleteMarkupBackward, insertNewlineContinueMarkup, markdownLanguage } from '@codemirror/lang-markdown';
import { LanguageSupport } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import * as Y from 'yjs';
import { mensajeParaPersona } from '../../api/errores.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { abrirDocumento } from '../../tiempo-real/documento.js';
import { indicadorRed } from '../../tiempo-real/estado-red.js';
import { quienEsta } from '../../tiempo-real/quien-esta.js';
import { panelComentarios } from '../../comentarios/panel.js';
import { dibujarMarcas, marcasComentarios } from './marcas-comentarios.js';
import { vistaRenderizada } from '../../markdown/vista-renderizada.js';
import { COMANDOS } from './comandos.js';
import { menuBarra } from './menu-barra.js';
import { abrirPaleta } from './paleta.js';

const esMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = esMac ? '⌘' : 'Ctrl';

const escribe = (/** @type {string} */ rol) => rol === 'editor' || rol === 'propietario';

/** @param {Record<string, string>} params */
export async function render(params) {
  const id = params.id ?? '';
  const titulo = h('h1', { tabindex: '-1' }, 'Editar documento');
  const pagina = h('section', { class: 'pagina-editor' }, titulo);
  /** @type {import('../lector/documentos.js').Documento} */
  let d;
  try {
    d = await api.solicitar(`/documentos/${encodeURIComponent(id)}`);
  } catch (err) {
    pagina.append(aviso('error', mensajeParaPersona(err)), h('a', { href: '#/documentos' }, 'Volver a los documentos'));
    return pagina;
  }
  titulo.textContent = d.titulo;
  const yo = api.usuario();
  const red = indicadorRed();
  const soloLectura = h('div', { hidden: true }, aviso('advertencia', 'Solo puedes leer este documento: tu permiso no permite editarlo.'));
  const editable = new Compartment();
  /** @type {EditorView | null} */
  let vista = null;
  let rolActual = d.rol;
  const ponerRol = (/** @type {string} */ rol) => {
    rolActual = /** @type {typeof d.rol} */ (rol);
    const puede = escribe(rol);
    soloLectura.hidden = puede;
    vista?.dispatch({ effects: editable.reconfigure([EditorState.readOnly.of(!puede), EditorView.editable.of(puede)]) });
  };

  // Bloque M: si el permiso bajó a lectura mientras había cambios sin conexión, no se guardaron. Se dice.
  const rechazados = h(
    'div',
    { hidden: true },
    aviso('error', 'Los cambios que hiciste sin conexión no se guardaron: tu permiso ahora es de solo lectura. Recarga la página para ver la versión guardada.'),
  );
  red.poner('conectando');
  const vivo = await abrirDocumento({
    documentoId: d.id,
    alEstado: red.poner,
    alRol: ponerRol,
    alPendiente: red.ponerPendiente,
    alCopia: red.ponerCopia,
    alRechazados: () => {
      rechazados.hidden = false;
    },
    persistir: yo ? { usuarioId: yo.id } : undefined,
  });
  const ayuda = h(
    'p',
    { id: 'ayuda-editor', class: 'ayuda' },
    'Markdown. ',
    h('kbd', {}, 'Tab'),
    ' sale del editor. ',
    h('kbd', {}, `${MOD}+]`),
    ' aumenta la sangría y ',
    h('kbd', {}, `${MOD}+[`),
    ' la quita. ',
    h('kbd', {}, `${MOD}+Z`),
    ' deshace solo tus cambios. ',
    h('kbd', {}, `${MOD}+K`),
    ' abre los comandos; escribe ',
    h('kbd', {}, '/'),
    ' al principio de una línea para insertar títulos, listas, tablas o código. ',
    h('kbd', {}, `${MOD}+B`),
    ' negrita, ',
    h('kbd', {}, `${MOD}+I`),
    ' cursiva.',
  );
  const lugar = h('div', { class: 'editor-documento' });
  /** @type {ReturnType<typeof panelComentarios> | null} */
  let panel = null;

  // Bloque O: la vista previa renderizada (se crea al mostrarla y se destruye al ocultarla).
  const previa = h('div', { class: 'previa', hidden: true });
  /** @type {ReturnType<typeof vistaRenderizada> | null} */
  let renderizada = null;
  const botonPrevia = h('button', { type: 'button', class: 'boton boton-chico', 'aria-pressed': 'false', 'aria-controls': 'previa-documento' }, 'Vista previa');
  previa.id = 'previa-documento';
  const mostrarPrevia = (/** @type {boolean} */ si) => {
    botonPrevia.setAttribute('aria-pressed', String(si));
    previa.hidden = !si;
    if (si && !renderizada) {
      renderizada = vistaRenderizada({ texto: vivo.texto, etiqueta: `Vista previa de ${d.titulo}` });
      previa.replaceChildren(h('h2', { class: 'previa-titulo' }, 'Vista previa'), renderizada.el);
    } else if (!si && renderizada) {
      renderizada.destruir();
      renderizada = null;
      previa.replaceChildren();
    }
  };
  botonPrevia.addEventListener('click', () => mostrarPrevia(botonPrevia.getAttribute('aria-pressed') !== 'true'));

  // La paleta (Ctrl+K): los comandos de Markdown y algunas acciones de la página.
  const abrirLaPaleta = () => {
    const v = vista;
    if (!v) return true;
    abrirPaleta({
      acciones: [
        ...COMANDOS.filter(() => escribe(rolActual)).map((c) => ({ ...c, aplicar: () => void c.aplicar(v) })),
        { id: 'previa', nombre: 'Vista previa (mostrar u ocultar)', palabras: 'vista previa renderizada', aplicar: () => mostrarPrevia(botonPrevia.getAttribute('aria-pressed') !== 'true') },
        { id: 'historial', nombre: 'Historial de versiones', palabras: 'historial versiones restaurar', aplicar: () => { location.hash = `#/documentos/${encodeURIComponent(d.id)}/versiones`; } },
        { id: 'comentar', nombre: 'Comentar la selección', palabras: 'comentario comentar', aplicar: () => setTimeout(() => document.getElementById('comentar-cuerpo')?.focus(), 0) },
      ],
      alCerrar: () => v.focus(),
    });
    return true;
  };
  // Ctrl+K también fuera del editor (en el panel, en los botones): la paleta es de toda la página.
  const alTecla = (/** @type {KeyboardEvent} */ ev) => {
    if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === 'k' && !vista?.hasFocus) {
      ev.preventDefault();
      abrirLaPaleta();
    }
  };
  document.addEventListener('keydown', alTecla);

  vista = new EditorView({
    parent: lugar,
    state: EditorState.create({
      doc: vivo.texto.toString(),
      extensions: [
        keymap.of([
          ...yUndoManagerKeymap,
          // Atajos de Markdown (antes que los de CodeMirror: Mod-i allí selecciona el nodo padre).
          ...COMANDOS.filter((c) => c.atajo).map((c) => ({ key: c.atajo, run: c.aplicar })),
          { key: 'Mod-k', run: abrirLaPaleta },
          // Enter continúa la lista o la cita; Retroceso quita la marca (de lang-markdown, sin HTML).
          { key: 'Enter', run: insertNewlineContinueMarkup },
          { key: 'Backspace', run: deleteMarkupBackward },
          ...defaultKeymap,
        ]),
        menuBarra,
        new LanguageSupport(markdownLanguage),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': `Contenido de ${d.titulo}`, 'aria-describedby': 'ayuda-editor', 'aria-multiline': 'true' }),
        editable.of([EditorState.readOnly.of(!escribe(d.rol)), EditorView.editable.of(escribe(d.rol))]),
        yCollab(vivo.texto, vivo.presencia, { undoManager: new Y.UndoManager(vivo.texto) }),
        // Bloque N: las marcas de los comentarios, y la selección para comentarla.
        marcasComentarios,
        EditorView.updateListener.of((u) => {
          if (u.selectionSet) panel?.actualizarSeleccion();
        }),
      ],
    }),
  });
  soloLectura.hidden = escribe(d.rol);

  if (yo) {
    const v = vista;
    panel = panelComentarios({
      documentoId: d.id,
      vivo,
      yo,
      rol: () => rolActual,
      seleccion: () => {
        const s = v.state.selection.main;
        return s.empty ? null : { inicio: s.from, fin: s.to };
      },
      alIr: ({ inicio, fin }) => {
        v.dispatch({ selection: { anchor: inicio, head: fin }, scrollIntoView: true });
        v.focus();
      },
      alMarcas: (marcas) => dibujarMarcas(v, marcas),
    });
  }
  // Al cerrar el documento (cambio de ruta), también el editor y el panel.
  vivo.doc.on('destroy', () => {
    document.removeEventListener('keydown', alTecla);
    renderizada?.destruir();
    panel?.destruir();
    vista?.destroy();
  });

  pagina.append(red.el, rechazados, soloLectura);
  if (yo) pagina.append(quienEsta(vivo.presencia, yo));
  pagina.append(
    h('p', { class: 'enlaces-documento' }, h('a', { href: `#/documentos/${encodeURIComponent(d.id)}` }, 'Ver sin editar'), ' · ', h('a', { href: `#/documentos/${encodeURIComponent(d.id)}/versiones` }, 'Historial de versiones')),
    h('div', { class: 'zona-documento' }, h('div', {}, ayuda, h('p', { class: 'acciones' }, botonPrevia), lugar, previa), panel?.el ?? null),
  );
  return pagina;
}
