// Leer un documento (bloque L), sin CodeMirror (ADR 0004): solo Yjs para recibir los cambios en vivo. El
// Markdown se muestra como TEXTO (textContent) hasta que llegue la vista renderizada (bloque O).
import { mensajeParaPersona } from '../../api/errores.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { abrirDocumento } from '../../tiempo-real/documento.js';
import { indicadorRed } from '../../tiempo-real/estado-red.js';
import { quienEsta } from '../../tiempo-real/quien-esta.js';
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
  const texto = h('pre', { class: 'documento-texto', tabindex: '0', 'aria-label': `Contenido de ${d.titulo}` });
  const vacio = h('p', { class: 'vacio' }, 'Este documento está vacío.');
  // Quien lee no guarda copia en el dispositivo (no tiene cambios propios que conservar).
  red.poner('conectando');
  const vivo = await abrirDocumento({ documentoId: d.id, alEstado: red.poner });
  const dibujar = () => {
    const t = vivo.texto.toString();
    texto.textContent = t;
    texto.hidden = t.length === 0;
    vacio.hidden = t.length > 0;
  };
  vivo.texto.observe(dibujar);
  dibujar();
  pagina.append(red.el);
  if (puedeEditar(d.rol) && yo?.rol !== 'lector') pagina.append(h('p', {}, h('a', { href: `#/documentos/${encodeURIComponent(d.id)}/editar` }, 'Editar este documento')));
  if (yo) pagina.append(quienEsta(vivo.presencia, yo));
  pagina.append(vacio, texto);
  return pagina;
}
