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
import { menuBarraCon } from './menu-barra.js';
import { abrirPaleta } from './paleta.js';
import { anunciar } from '../../componentes/anunciar.js';

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
  // Bloque Q: el autocompletado de la IA entra aquí (vacío hasta que se activa en el panel).
  const sugerenciasIa = new Compartment();
  /** @type {EditorView | null} */
  let vista = null;
  /** @type {ReturnType<import('../../diferidas/ia.js')['panelIa']> | null} */
  let panelIa = null;
  let rolActual = d.rol;
  const ponerRol = (/** @type {string} */ rol) => {
    rolActual = /** @type {typeof d.rol} */ (rol);
    const puede = escribe(rol);
    soloLectura.hidden = puede;
    vista?.dispatch({ effects: editable.reconfigure([EditorState.readOnly.of(!puede), EditorView.editable.of(puede)]) });
    panelIa?.porRol();
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

  // Bloque Q: la IA, BAJO DEMANDA: el panel (src/diferidas/ia.js) se descarga al primer uso, y el
  // autocompletado (src/diferidas/ia-autocompletado.js) solo al activar el interruptor. Ninguno entra en
  // el chunk del editor.
  const lugarIa = h('div', { class: 'lugar-ia' });
  const botonIa = h('button', { type: 'button', class: 'boton boton-chico boton-ia', 'aria-expanded': 'false', 'aria-controls': 'panel-ia' }, 'IA');
  /** @type {{ extension: import('@codemirror/state').Extension, destruir: () => void } | null} */
  let autoIa = null;
  let quiereAuto = false;
  /** @param {(p: NonNullable<typeof panelIa>) => unknown} f */
  const conIa = async (f) => {
    const v = vista;
    if (!v) return;
    if (!panelIa) {
      let m;
      try {
        m = await import('../../diferidas/ia.js');
      } catch (err) {
        lugarIa.replaceChildren(aviso('error', mensajeParaPersona(err)));
        return;
      }
      panelIa ??= m.panelIa({
        documentoId: d.id,
        rol: () => rolActual,
        texto: () => v.state.doc.toString(),
        seleccion: () => {
          const s = v.state.selection.main;
          return s.empty ? null : { desde: s.from, hasta: s.to, texto: v.state.sliceDoc(s.from, s.to) };
        },
        aplicar: {
          // Como una transacción normal del editor: viaja por el CRDT con la autoría de quien acepta.
          reemplazar: (s, nuevo) => {
            if (!escribe(rolActual) || v.state.sliceDoc(s.desde, s.hasta) !== s.texto) return false;
            v.dispatch({ changes: { from: s.desde, to: s.hasta, insert: nuevo }, selection: { anchor: s.desde, head: s.desde + nuevo.length }, userEvent: 'input.ia' });
            v.focus();
            return true;
          },
          insertarDebajo: (s, nuevo) => {
            if (!escribe(rolActual)) return;
            const fin = v.state.doc.lineAt(Math.min(s.hasta, v.state.doc.length)).to;
            v.dispatch({ changes: { from: fin, insert: `\n\n${nuevo}` }, selection: { anchor: fin + 2, head: fin + 2 + nuevo.length }, userEvent: 'input.ia' });
            v.focus();
          },
        },
        sugerencias: {
          poner: async (si, alError) => {
            quiereAuto = si;
            if (si && !autoIa) {
              const a = await import('../../diferidas/ia-autocompletado.js');
              // Mientras se descargaba, se pudo apagar (o activar dos veces).
              if (!quiereAuto || autoIa) return;
              autoIa = a.crearAutocompletado({ control: vivo.control, anunciar, alError });
              v.dispatch({ effects: sugerenciasIa.reconfigure(autoIa.extension) });
            } else if (!si && autoIa) {
              autoIa.destruir();
              autoIa = null;
              v.dispatch({ effects: sugerenciasIa.reconfigure([]) });
            }
          },
        },
        alCerrar: () => {
          botonIa.setAttribute('aria-expanded', 'false');
          v.focus();
        },
      });
      lugarIa.replaceChildren(panelIa.el);
    }
    botonIa.setAttribute('aria-expanded', 'true');
    await f(panelIa);
  };
  botonIa.addEventListener('click', () => {
    if (panelIa?.abierto()) panelIa.cerrar();
    else void conIa((p) => p.abrir());
  });
  const accionesIa = () => [
    { id: 'ia-abrir', nombre: 'Abrir el asistente de IA', palabras: 'ia asistente inteligencia artificial', aplicar: () => void conIa((p) => p.abrir()) },
    { id: 'ia-explicar', nombre: 'Explicar la selección con la IA', palabras: 'ia explicar explicacion', aplicar: () => void conIa((p) => p.explicar()) },
    { id: 'ia-resumir', nombre: 'Resumir el documento con la IA', palabras: 'ia resumir resumen', aplicar: () => void conIa((p) => p.resumir()) },
    ...(escribe(rolActual)
      ? /** @type {const} */ (['claro', 'breve', 'formal']).map((e) => ({
          id: `ia-mejorar-${e}`,
          nombre: `Mejorar la selección con la IA (${e})`,
          palabras: `ia mejorar reescribir ${e}`,
          aplicar: () => void conIa((p) => p.mejorar(e)),
        }))
      : []),
  ];

  // La paleta (Ctrl+K): los comandos de Markdown y algunas acciones de la página.
  const abrirLaPaleta = () => {
    const v = vista;
    if (!v) return true;
    abrirPaleta({
      acciones: [
        ...COMANDOS.filter(() => escribe(rolActual)).map((c) => ({ ...c, aplicar: () => void c.aplicar(v) })),
        ...accionesIa(),
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
        // Al principio de una línea no hay selección: del "/" solo abrir el asistente y resumir.
        menuBarraCon(() => accionesIa().filter((a) => a.id === 'ia-abrir' || a.id === 'ia-resumir')),
        sugerenciasIa.of([]),
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
    panelIa?.destruir();
    vista?.destroy();
  });

  pagina.append(red.el, rechazados, soloLectura);
  if (yo) pagina.append(quienEsta(vivo.presencia, yo));
  pagina.append(
    h('p', { class: 'enlaces-documento' }, h('a', { href: `#/documentos/${encodeURIComponent(d.id)}` }, 'Ver sin editar'), ' · ', h('a', { href: `#/documentos/${encodeURIComponent(d.id)}/versiones` }, 'Historial de versiones')),
    h('div', { class: 'zona-documento' }, h('div', {}, ayuda, h('p', { class: 'acciones' }, botonPrevia, ' ', botonIa), lugarIa, lugar, previa), panel?.el ?? null),
  );
  return pagina;
}
