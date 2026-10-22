// Panel de comentarios anclados (bloque N), el mismo en la vista de lectura y en el editor. Quien lo usa
// le da: cómo leer la selección actual, cómo ir a un tramo y cómo dibujar las marcas en el texto.
//
// Permisos (los decide el backend; aquí solo se ocultan los botones que darían 403):
//   comentar y responder: cualquiera con acceso; editar: quien escribió; resolver: quien abrió el hilo, o
//   un editor o propietario; borrar: quien escribió, o el propietario del documento.
// Si llega un cambio de otra persona mientras se escribe una respuesta o una edición, el borrador NO se
// pierde (se guarda por hilo y se repone al redibujar).
import { mensajeParaPersona } from '../api/errores.js';
import { anunciar } from '../componentes/anunciar.js';
import { aviso, h } from '../dom.js';
import { api } from '../sesion.js';
import { codificarAncla, resolverAncla } from './anclas.js';

/**
 * @typedef {{
 *   id: string, padreId: string | null, autor: { id: string, nombre: string }, ancla: string | null,
 *   cuerpo: string, resuelto: boolean, creadoEn: string, editadoEn: string | null
 * }} Comentario
 * @typedef {{ inicio: number, fin: number }} Tramo
 * @typedef {{ id: string, inicio: number, fin: number, activa: boolean }} Marca
 */

const FECHA = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const cita = (/** @type {string} */ t) => (t.length > 120 ? `${t.slice(0, 120)}…` : t);

/**
 * @param {{
 *   documentoId: string,
 *   vivo: { doc: import('yjs').Doc, texto: import('yjs').Text, alCambiarComentarios: (f: () => void) => () => void },
 *   yo: { id: string },
 *   rol: () => string,
 *   seleccion: () => Tramo | null,
 *   alIr: (t: Tramo) => void,
 *   alMarcas: (m: Marca[]) => void,
 * }} o
 */
export function panelComentarios(o) {
  /** @type {Comentario[]} */
  let comentarios = [];
  let verResueltos = false;
  /** @type {string | null} */
  let activo = null;
  /** Borradores por clave ("responder:<id>", "editar:<id>") que sobreviven a redibujar. */
  /** @type {Map<string, string>} */
  const borradores = new Map();
  /** Citas visibles por hilo, para actualizarlas al editar el texto sin redibujar todo. */
  /** @type {Map<string, HTMLElement>} */
  const citas = new Map();

  const estado = h('div', { class: 'comentarios-estado' });
  const lista = h('div', { class: 'hilos' });
  const ayuda = h('p', { id: 'comentar-ayuda', class: 'ayuda' });
  const nuevo = h('textarea', { id: 'comentar-cuerpo', name: 'cuerpo', rows: '3', maxlength: '5000', 'aria-describedby': 'comentar-ayuda' });
  const botonComentar = h('button', { type: 'submit', class: 'boton' }, 'Comentar');
  const form = h('form', { class: 'comentar', novalidate: true }, h('label', { for: 'comentar-cuerpo' }, 'Comentar la selección'), nuevo, ayuda, botonComentar);
  const resueltos = h('input', { type: 'checkbox', id: 'ver-resueltos' });
  const etiquetaResueltos = h('label', { for: 'ver-resueltos' }, 'Mostrar resueltos');
  const el = h(
    'aside',
    { class: 'comentarios', 'aria-labelledby': 'comentarios-titulo' },
    h('h2', { id: 'comentarios-titulo' }, 'Comentarios'),
    form,
    h('p', { class: 'ver-resueltos' }, resueltos, ' ', etiquetaResueltos),
    estado,
    lista,
  );

  const raices = () => comentarios.filter((c) => c.padreId === null);
  const respuestasDe = (/** @type {string} */ id) => comentarios.filter((c) => c.padreId === id);
  const tramoDe = (/** @type {Comentario} */ c) => (c.ancla ? resolverAncla(c.ancla, o.vivo.doc) : null);
  const puedeEditar = (/** @type {Comentario} */ c) => c.autor.id === o.yo.id;
  const puedeResolver = (/** @type {Comentario} */ c) => c.autor.id === o.yo.id || o.rol() === 'editor' || o.rol() === 'propietario';
  const puedeBorrar = (/** @type {Comentario} */ c) => c.autor.id === o.yo.id || o.rol() === 'propietario';

  /** Las marcas en el texto: hilos abiertos (y el activo aunque esté resuelto). */
  function marcar() {
    /** @type {Marca[]} */
    const marcas = [];
    for (const c of raices()) {
      if (c.resuelto && c.id !== activo) continue;
      const t = tramoDe(c);
      if (t) marcas.push({ id: c.id, ...t, activa: c.id === activo });
    }
    o.alMarcas(marcas);
  }

  /** Actualiza las citas (el texto comentado) sin redibujar los hilos. */
  function actualizarCitas() {
    const texto = o.vivo.texto.toString();
    for (const c of raices()) {
      const el = citas.get(c.id);
      if (!el) continue;
      const t = tramoDe(c);
      el.replaceChildren(t ? `«${cita(texto.slice(t.inicio, t.fin))}»` : h('em', {}, 'El texto comentado se eliminó.'));
    }
    marcar();
  }

  /** Lo que ve la ayuda del formulario: qué se va a comentar. */
  function actualizarSeleccion() {
    const s = o.seleccion();
    if (!s) {
      ayuda.textContent = 'Selecciona un tramo del texto para comentarlo.';
      return;
    }
    ayuda.textContent = `Vas a comentar: «${cita(o.vivo.texto.toString().slice(s.inicio, s.fin))}»`;
  }

  /**
   * Un formulario chico (responder o editar) con su borrador.
   * @param {string} clave @param {string} etiqueta @param {string} inicial @param {string} enviarTexto
   * @param {(cuerpo: string) => Promise<unknown>} enviar
   */
  function formChico(clave, etiqueta, inicial, enviarTexto, enviar) {
    const id = `f-${clave.replace(/[^a-z0-9-]/gi, '-')}`;
    const area = h('textarea', { id, rows: '2', maxlength: '5000', 'data-borrador': clave });
    area.value = borradores.get(clave) ?? inicial;
    area.addEventListener('input', () => borradores.set(clave, area.value));
    const enviarBoton = h('button', { type: 'submit', class: 'boton boton-chico' }, enviarTexto);
    const cancelar = h('button', { type: 'button', class: 'boton boton-chico' }, 'Cancelar');
    const f = h('form', { class: 'comentar-chico', novalidate: true }, h('label', { for: id }, etiqueta), area, h('p', { class: 'acciones' }, enviarBoton, cancelar));
    cancelar.addEventListener('click', () => {
      borradores.delete(clave);
      dibujar();
    });
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const cuerpo = area.value.trim();
      if (!cuerpo) return;
      enviarBoton.disabled = true;
      enviar(cuerpo).then(
        () => {
          borradores.delete(clave);
          void cargar();
        },
        (err) => {
          enviarBoton.disabled = false;
          mostrarError(err);
        },
      );
    });
    return f;
  }

  const mostrarError = (/** @type {unknown} */ err) => {
    const texto = typeof err === 'string' ? err : mensajeParaPersona(err);
    estado.replaceChildren(aviso('error', texto));
    anunciar(texto);
  };

  /** @param {Comentario} c @param {boolean} esHilo */
  function vistaComentario(c, esHilo) {
    const acciones = h('p', { class: 'acciones' });
    const cuerpo = borradores.has(`editar:${c.id}`)
      ? formChico(`editar:${c.id}`, 'Editar el comentario', c.cuerpo, 'Guardar', (t) =>
          api.solicitar(`/comentarios/${encodeURIComponent(c.id)}`, { metodo: 'PATCH', cuerpo: { cuerpo: t } }),
        )
      : h('p', { class: 'comentario-cuerpo' }, c.cuerpo);
    if (puedeEditar(c) && !borradores.has(`editar:${c.id}`)) {
      const b = h('button', { type: 'button', class: 'boton boton-chico' }, 'Editar');
      b.addEventListener('click', () => {
        borradores.set(`editar:${c.id}`, c.cuerpo);
        dibujar();
      });
      acciones.append(b);
    }
    if (puedeBorrar(c)) {
      const b = h('button', { type: 'button', class: 'boton boton-chico boton-peligro' }, 'Borrar');
      b.addEventListener('click', () => {
        const n = esHilo ? respuestasDe(c.id).length : 0;
        const si = h('button', { type: 'button', class: 'boton boton-chico boton-peligro' }, 'Sí, borrar');
        const no = h('button', { type: 'button', class: 'boton boton-chico' }, 'No');
        const pregunta = h('p', { tabindex: '-1' }, n > 0 ? `¿Borrar este hilo y sus ${String(n)} respuestas?` : '¿Borrar este comentario?');
        const confirmar = h('div', { class: 'confirmar' }, pregunta, h('p', { class: 'acciones' }, si, no));
        acciones.replaceWith(confirmar);
        pregunta.focus();
        no.addEventListener('click', () => dibujar());
        si.addEventListener('click', () => {
          si.disabled = true;
          api.solicitar(`/comentarios/${encodeURIComponent(c.id)}`, { metodo: 'DELETE' }).then(
            () => {
              anunciar('Comentario borrado.');
              void cargar();
            },
            mostrarError,
          );
        });
      });
      acciones.append(b);
    }
    return h(
      'div',
      { class: 'comentario' },
      h('p', { class: 'comentario-autor' }, h('strong', {}, c.autor.nombre), ' · ', h('time', { datetime: c.creadoEn }, FECHA.format(new Date(c.creadoEn))), c.editadoEn ? ' · editado' : ''),
      cuerpo,
      acciones,
    );
  }

  /** @param {Comentario} c */
  function vistaHilo(c) {
    const idTitulo = `hilo-${c.id}`;
    const citaEl = h('blockquote', { class: 'cita' });
    citas.set(c.id, citaEl);
    const acciones = h('p', { class: 'acciones' });
    const t = tramoDe(c);
    if (t) {
      const ir = h('button', { type: 'button', class: 'boton boton-chico' }, 'Ir al texto');
      ir.addEventListener('click', () => {
        activo = c.id;
        marcar();
        const ahora = tramoDe(c);
        if (ahora) o.alIr(ahora);
      });
      acciones.append(ir);
    }
    if (puedeResolver(c)) {
      const b = h('button', { type: 'button', class: 'boton boton-chico' }, c.resuelto ? 'Reabrir' : 'Resolver');
      b.addEventListener('click', () => {
        b.disabled = true;
        api.solicitar(`/comentarios/${encodeURIComponent(c.id)}`, { metodo: 'PATCH', cuerpo: { resuelto: !c.resuelto } }).then(() => {
          anunciar(c.resuelto ? 'Hilo reabierto.' : 'Hilo resuelto.');
          void cargar();
        }, mostrarError);
      });
      acciones.append(b);
    }
    const responder = borradores.has(`responder:${c.id}`)
      ? formChico(`responder:${c.id}`, 'Tu respuesta', '', 'Responder', (cuerpo) =>
          api.solicitar(`/documentos/${encodeURIComponent(o.documentoId)}/comentarios`, { metodo: 'POST', cuerpo: { cuerpo, padreId: c.id } }),
        )
      : null;
    if (!responder) {
      const b = h('button', { type: 'button', class: 'boton boton-chico' }, 'Responder');
      b.addEventListener('click', () => {
        borradores.set(`responder:${c.id}`, '');
        dibujar();
        document.getElementById(`f-responder-${c.id}`)?.focus();
      });
      acciones.append(b);
    }
    return h(
      'article',
      { class: c.id === activo ? 'hilo hilo-activo' : 'hilo', 'aria-labelledby': idTitulo, 'data-hilo': c.id },
      h('h3', { id: idTitulo, class: 'hilo-titulo' }, c.resuelto ? `Hilo de ${c.autor.nombre} (resuelto)` : `Hilo de ${c.autor.nombre}`),
      citaEl,
      vistaComentario(c, true),
      ...respuestasDe(c.id).map((r) => vistaComentario(r, false)),
      responder,
      acciones,
    );
  }

  function dibujar() {
    // Recordar qué borrador tenía el foco para devolvérselo.
    const conFoco = /** @type {HTMLElement | null} */ (document.activeElement)?.getAttribute?.('data-borrador') ?? null;
    citas.clear();
    const todos = raices();
    const visibles = todos.filter((c) => verResueltos || !c.resuelto);
    const nResueltos = todos.filter((c) => c.resuelto).length;
    etiquetaResueltos.textContent = `Mostrar resueltos (${String(nResueltos)})`;
    // Orden: por dónde está el tramo en el texto; los de texto eliminado, al final.
    const posicion = (/** @type {Comentario} */ c) => tramoDe(c)?.inicio ?? Number.MAX_SAFE_INTEGER;
    visibles.sort((a, b) => posicion(a) - posicion(b));
    lista.replaceChildren(...(visibles.length ? visibles.map(vistaHilo) : [h('p', { class: 'vacio' }, todos.length ? 'No hay hilos abiertos.' : 'Todavía no hay comentarios.')]));
    actualizarCitas();
    if (conFoco) /** @type {HTMLElement | null} */ (lista.querySelector(`[data-borrador="${CSS.escape(conFoco)}"]`))?.focus();
  }

  async function cargar() {
    try {
      /** @type {{ comentarios: Comentario[] }} */
      const r = await api.solicitar(`/documentos/${encodeURIComponent(o.documentoId)}/comentarios`);
      comentarios = r.comentarios;
      estado.replaceChildren();
      dibujar();
    } catch (err) {
      mostrarError(err);
    }
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const s = o.seleccion();
    const cuerpo = nuevo.value.trim();
    if (!s) return mostrarError('Selecciona un tramo del texto para comentarlo.');
    if (!cuerpo) return mostrarError('Escribe el comentario.');
    botonComentar.disabled = true;
    api
      .solicitar(`/documentos/${encodeURIComponent(o.documentoId)}/comentarios`, {
        metodo: 'POST',
        cuerpo: { cuerpo, ancla: codificarAncla(o.vivo.texto, s.inicio, s.fin) },
      })
      .then(
        (/** @type {Comentario} */ c) => {
          nuevo.value = '';
          activo = c.id;
          anunciar('Comentario publicado.');
          void cargar();
        },
        mostrarError,
      )
      .finally(() => {
        botonComentar.disabled = false;
      });
  });
  resueltos.addEventListener('change', () => {
    verResueltos = resueltos.checked;
    dibujar();
  });

  const dejarDeOir = o.vivo.alCambiarComentarios(() => void cargar());
  // El texto cambia DENTRO de una actualización del editor (y-codemirror aplica el cambio local al Y.Text
  // mientras CodeMirror actualiza): dibujar las marcas ahí mismo sería otro dispatch en medio del primero,
  // que CodeMirror rechaza (y rompe la sincronía). Se dibuja después, una vez por tanda de cambios.
  let programado = false;
  const alEditar = () => {
    if (programado) return;
    programado = true;
    queueMicrotask(() => {
      programado = false;
      actualizarCitas();
    });
  };
  o.vivo.texto.observe(alEditar);
  actualizarSeleccion();
  void cargar();

  return {
    el,
    actualizarSeleccion,
    destruir() {
      dejarDeOir();
      o.vivo.texto.unobserve(alEditar);
    },
  };
}
