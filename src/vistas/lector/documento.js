// Leer un documento (bloque L), sin CodeMirror (ADR 0004): solo Yjs para recibir los cambios en vivo. El
// Markdown se muestra como TEXTO (en un textarea de solo lectura) hasta que llegue la vista renderizada
// (bloque O). Al lado, los comentarios anclados (bloque N): quien lee también comenta.
import { mensajeParaPersona } from '../../api/errores.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { abrirDocumento } from '../../tiempo-real/documento.js';
import { indicadorRed } from '../../tiempo-real/estado-red.js';
import { quienEsta } from '../../tiempo-real/quien-esta.js';
import { panelComentarios } from '../../comentarios/panel.js';
import { puedeEditar } from './documentos.js';

/** @param {Record<string, string>} params */
export async function render(params) {
  const id = params.id ?? '';
  const titulo = h('h1', { tabindex: '-1' }, 'Documento');
  const pagina = h('section', {}, titulo);
  /** @type {import('./documentos.js').Documento} */
  let d;
  try {
    d = await api.solicitar(`/documentos/${encodeURIComponent(id)}`);
  } catch (err) {
    pagina.append(aviso('error', mensajeParaPersona(err)), h('a', { href: '#/documentos' }, 'Volver a los documentos'));
    return pagina;
  }
  const yo = api.usuario();
  titulo.textContent = d.titulo;
  const red = indicadorRed();
  // Bloque N: un textarea que no se deja editar, no un <pre>, para que el tramo a comentar se pueda
  // seleccionar también con el teclado (Mayús + flechas) y dé sus posiciones exactas. NO lleva el atributo
  // readonly: en Chromium, un textarea readonly no mueve el cursor ni selecciona con el teclado (medido en
  // el E2E). Se marca aria-readonly y se rechaza toda edición (beforeinput); lo que no se puede cancelar
  // (una composición de IME en Chrome) se deshace al llegar (input).
  const texto = h('textarea', { class: 'documento-texto', 'aria-readonly': 'true', rows: '12', 'aria-label': `Contenido de ${d.titulo}`, spellcheck: 'false' });
  texto.addEventListener('beforeinput', (ev) => ev.preventDefault());
  const vacio = h('p', { class: 'vacio' }, 'Este documento está vacío.');
  // Quien lee no guarda copia en el dispositivo (no tiene cambios propios que conservar).
  red.poner('conectando');
  const vivo = await abrirDocumento({ documentoId: d.id, alEstado: red.poner });
  const dibujar = () => {
    const t = vivo.texto.toString();
    const [inicio, fin] = [texto.selectionStart, texto.selectionEnd];
    texto.value = t;
    texto.setSelectionRange(Math.min(inicio, t.length), Math.min(fin, t.length));
    texto.rows = Math.min(Math.max(t.split('\n').length + 1, 6), 40);
    texto.hidden = t.length === 0;
    vacio.hidden = t.length > 0;
  };
  vivo.texto.observe(dibujar);
  texto.addEventListener('input', dibujar);
  dibujar();
  pagina.append(red.el);
  pagina.append(
    h(
      'p',
      { class: 'enlaces-documento' },
      puedeEditar(d.rol) && yo?.rol !== 'lector' ? h('a', { href: `#/documentos/${encodeURIComponent(d.id)}/editar` }, 'Editar este documento') : null,
      puedeEditar(d.rol) && yo?.rol !== 'lector' ? ' · ' : null,
      h('a', { href: `#/documentos/${encodeURIComponent(d.id)}/versiones` }, 'Historial de versiones'),
    ),
  );
  if (yo) pagina.append(quienEsta(vivo.presencia, yo));
  /** @type {ReturnType<typeof panelComentarios> | null} */
  let panel = null;
  if (yo) {
    panel = panelComentarios({
      documentoId: d.id,
      vivo,
      yo,
      rol: () => d.rol,
      seleccion: () => (texto.selectionStart < texto.selectionEnd ? { inicio: texto.selectionStart, fin: texto.selectionEnd } : null),
      alIr: ({ inicio, fin }) => {
        texto.focus();
        texto.setSelectionRange(inicio, fin);
      },
      alMarcas: () => undefined, // en el textarea no se dibujan: el panel muestra cada tramo
    });
    const p = panel;
    // La selección del textarea cambia con el ratón y con el teclado; según el navegador, avisa con uno u
    // otro de estos eventos.
    const alSeleccionar = () => p.actualizarSeleccion();
    for (const ev of ['select', 'selectionchange', 'keyup', 'mouseup']) texto.addEventListener(ev, alSeleccionar);
    document.addEventListener('selectionchange', alSeleccionar);
    vivo.doc.on('destroy', () => {
      document.removeEventListener('selectionchange', alSeleccionar);
      p.destruir();
    });
  }
  pagina.append(h('div', { class: 'zona-documento' }, h('div', {}, vacio, texto), panel?.el ?? null));
  return pagina;
}
