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
import { vistaRenderizada } from '../../markdown/vista-renderizada.js';
import { fuenteARango, seleccionAFuente } from '../../comentarios/posiciones.js';
import { puedeEditar } from './documentos.js';
import { cargarIa } from '../../ia-carga.js';

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

  // Bloque O: se lee la vista RENDERIZADA. Un tramo se comenta seleccionándolo ahí con el ratón o el dedo;
  // con el teclado, en el texto fuente (a un botón de distancia; la ayuda lo dice y se anuncia al entrar a
  // la vista).
  const renderizada = vistaRenderizada({ texto: vivo.texto, etiqueta: `Documento ${d.titulo}`, descripcion: 'ayuda-lectura' });
  const fuente = h('div', { hidden: true }, vacio, texto);
  const alternar = h('button', { type: 'button', class: 'boton boton-chico', 'aria-pressed': 'false' }, 'Ver el texto fuente');
  const verFuente = (/** @type {boolean} */ si) => {
    fuente.hidden = !si;
    renderizada.el.hidden = si;
    alternar.setAttribute('aria-pressed', String(si));
  };
  alternar.addEventListener('click', () => verFuente(alternar.getAttribute('aria-pressed') !== 'true'));
  vivo.doc.on('destroy', () => renderizada.destruir());
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
      seleccion: () => {
        if (!fuente.hidden) return texto.selectionStart < texto.selectionEnd ? { inicio: texto.selectionStart, fin: texto.selectionEnd } : null;
        return seleccionAFuente(renderizada.el);
      },
      alIr: ({ inicio, fin }) => {
        if (!fuente.hidden) {
          texto.focus();
          texto.setSelectionRange(inicio, fin);
          return;
        }
        // En la vista renderizada: seleccionar el tramo y llevarlo a la vista.
        const rango = fuenteARango(renderizada.el, inicio, fin);
        if (!rango) return;
        renderizada.el.focus({ preventScroll: true });
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(rango);
        rango.startContainer.parentElement?.scrollIntoView({ block: 'center' });
      },
      // Subrayados en la vista renderizada (en el texto fuente no se dibujan: el panel muestra cada tramo).
      alMarcas: (marcas) => renderizada.ponerMarcas(marcas),
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
  // Bloque Q: la IA (explicar y resumir; quien lee no mejora ni autocompleta), BAJO DEMANDA.
  const lugarIa = h('div', { class: 'lugar-ia' });
  const botonIa = h('button', { type: 'button', class: 'boton boton-chico boton-ia', 'aria-expanded': 'false', 'aria-controls': 'panel-ia' }, 'IA');
  /** @type {ReturnType<import('../../diferidas/ia.js')['panelIa']> | null} */
  let panelIa = null;
  botonIa.addEventListener('click', () => {
    if (panelIa?.abierto()) {
      panelIa.cerrar();
      return;
    }
    void cargarIa().then((m) => {
      panelIa ??= m.panelIa({
        documentoId: d.id,
        rol: () => d.rol,
        texto: () => vivo.texto.toString(),
        seleccion: () => {
          const s = !fuente.hidden
            ? texto.selectionStart < texto.selectionEnd
              ? { inicio: texto.selectionStart, fin: texto.selectionEnd }
              : null
            : seleccionAFuente(renderizada.el);
          return s ? { desde: s.inicio, hasta: s.fin, texto: vivo.texto.toString().slice(s.inicio, s.fin) } : null;
        },
        alCerrar: () => {
          botonIa.setAttribute('aria-expanded', 'false');
          botonIa.focus();
        },
      });
      if (!panelIa.el.isConnected) lugarIa.append(panelIa.el);
      botonIa.setAttribute('aria-expanded', 'true');
      panelIa.abrir();
    });
  });
  vivo.doc.on('destroy', () => panelIa?.destruir());

  pagina.append(
    h(
      'div',
      { class: 'zona-documento' },
      h(
        'div',
        {},
        h(
          'p',
          { class: 'acciones' },
          alternar,
          ' ',
          botonIa,
          ' ',
          h('span', { id: 'ayuda-lectura', class: 'ayuda' }, 'Para comentar, selecciona un tramo con el ratón o el dedo. Con el teclado, usa «Ver el texto fuente».'),
        ),
        lugarIa,
        renderizada.el,
        fuente,
      ),
      panel?.el ?? null,
    ),
  );
  return pagina;
}
