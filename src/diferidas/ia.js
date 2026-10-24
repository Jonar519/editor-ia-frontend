// Carga diferida del panel de IA (bloque Q; decisiones escritas del diseño). El código de IA del navegador
// está en tres diferidas, cada una importada SOLO por la vista que la usa (opción 1, decidida por escrito):
// esta (el panel: editor y lectura), ia-autocompletado.js (solo el editor, donde CodeMirror ya está) e
// ia-busqueda.js (solo la lista de documentos). Esta NO importa CodeMirror: quien lee no lo descarga
// (ADR 0004).
//
//   - Panel de IA: explicar la selección, resumir el documento y (editor o propietario) mejorar la
//     selección en tres estilos. Resumir y mejorar llegan en streaming (SSE sobre fetch POST) y se pueden
//     DETENER (aborta el fetch: el backend cancela la generación).
//   - Mejorar NUNCA se aplica solo: una propuesta con Reemplazar selección / Insertar debajo / Descartar,
//     que aplica como una transacción normal del editor (viaja por el CRDT con la autoría de quien acepta).
//   - La salida de la IA es texto no confiable: se muestra SOLO con el saneador del Markdown (sin HTML,
//     enlaces restringidos), nunca con innerHTML.
//   - Errores en --color-peligro (aviso de error); el violeta es solo la marca de la IA.
//   - Lectores de pantalla: el texto en streaming se anuncia por frases, no por fragmento.
//   - Las sugerencias mientras se escribe: el panel solo tiene el interruptor; quien lo ofrece (el editor)
//     carga ia-autocompletado.js al activarlo.
import { aviso, h } from '../dom.js';
import { anunciar } from '../componentes/anunciar.js';
import { renderizar } from '../markdown/vista.js';
import { api } from '../sesion.js';
import { mensajeIa } from './ia-mensajes.js';
import { leerSse } from './ia-sse.js';

/** Topes del backend (MAXIMOS_IA): lo que se manda por pedido. */
export const MAXIMOS = { explicar: 8000, transformar: 40_000 };
/** El backend corta Resumir y Mejorar a los 60 s; el fetch espera un poco más. */
const TIEMPO_CORRIENTE_MS = 75_000;
/** Cada cuánto, como mínimo, se anuncia lo nuevo del streaming (por frases completas). */
const ANUNCIO_CADA_MS = 1500;

/** @typedef {'claro' | 'breve' | 'formal'} Estilo */
/** @typedef {{ desde: number, hasta: number, texto: string }} Seleccion */

const ESTILOS = /** @type {const} */ ({ claro: 'más claro', breve: 'más breve', formal: 'más formal' });

const escribe = (/** @type {string} */ rol) => rol === 'editor' || rol === 'propietario';

/**
 * Anuncia el streaming por frases completas, a lo sumo cada ANUNCIO_CADA_MS.
 * @param {(texto: string) => void} decir
 */
export function crearAnunciadorFrases(decir, ahora = () => Date.now()) {
  let dicho = 0;
  let ultimo = -Infinity;
  return {
    /** @param {string} total el texto generado hasta ahora */
    avance(total) {
      if (ahora() - ultimo < ANUNCIO_CADA_MS) return;
      const fin = Math.max(total.lastIndexOf('. ', total.length), total.lastIndexOf('.\n'), total.lastIndexOf('? '), total.lastIndexOf('! '));
      if (fin < dicho) return;
      const nuevo = total.slice(dicho, fin + 1).trim();
      dicho = fin + 1;
      if (!nuevo) return;
      ultimo = ahora();
      decir(nuevo);
    },
    /** @param {string} total */
    fin(total) {
      const resto = total.slice(dicho).trim();
      decir(resto ? `${resto} Respuesta completa.` : 'Respuesta completa.');
    },
  };
}

/**
 * El panel de IA de un documento.
 * @param {{
 *   documentoId: string,
 *   rol: () => string,
 *   texto: () => string,
 *   seleccion: () => Seleccion | null,
 *   aplicar?: { reemplazar: (s: Seleccion, nuevo: string) => boolean, insertarDebajo: (s: Seleccion, nuevo: string) => void },
 *   sugerencias?: { poner: (si: boolean, alError: (codigo: string) => void) => Promise<void> },
 *   alCerrar: () => void,
 * }} o
 */
export function panelIa(o) {
  /** @type {AbortController | null} */
  let enCurso = null;
  let sugiriendo = false;

  const estado = h('p', { class: 'ia-estado', role: 'status' });
  const errores = h('div', { class: 'ia-errores' });
  const respuesta = h('div', { class: 'ia-respuesta', 'aria-labelledby': 'ia-titulo' });
  const propuesta = h('div', { class: 'ia-propuesta', hidden: true });
  const uso = h('p', { class: 'ia-uso ayuda' });

  const boton = (/** @type {string} */ texto, /** @type {Record<string, string>} */ a = {}) => h('button', { type: 'button', class: 'boton boton-chico', ...a }, texto);
  const bExplicar = boton('Explicar la selección');
  const bResumir = boton('Resumir el documento');
  const estilo = h(
    'select',
    { id: 'ia-estilo' },
    ...Object.entries(ESTILOS).map(([v, t]) => h('option', { value: v }, t)),
  );
  const bMejorar = boton('Mejorar la selección');
  const mejorar = h('span', { class: 'ia-mejorar' }, h('label', { for: 'ia-estilo' }, 'Estilo'), ' ', estilo, ' ', bMejorar);
  const bDetener = boton('Detener', { hidden: '' });
  const bIndice = boton('Actualizar índice de búsqueda');
  const interruptor = h('input', { type: 'checkbox', id: 'ia-sugerencias' });
  const sugerencias = h('p', { class: 'ia-sugerencias' }, interruptor, ' ', h('label', { for: 'ia-sugerencias' }, 'Sugerencias de la IA mientras escribes'));
  const bCerrar = boton('Cerrar el asistente');

  const el = h(
    'section',
    { class: 'panel-ia', id: 'panel-ia', 'aria-labelledby': 'ia-titulo', hidden: true },
    h('h2', { id: 'ia-titulo' }, h('span', { class: 'etiqueta-ia' }, 'IA'), ' Asistente'),
    h('p', { class: 'ayuda' }, 'Las respuestas se generan a partir del contenido del documento y pueden contener errores. Revísalas antes de usarlas.'),
    h('p', { class: 'ia-acciones' }, bExplicar, ' ', bResumir, ' ', mejorar, ' ', bDetener),
    sugerencias,
    errores,
    estado,
    respuesta,
    propuesta,
    uso,
    h('p', { class: 'ia-pie' }, bIndice, ' ', bCerrar),
  );

  /** Lo que depende del rol: mejorar, sugerencias e índice, solo para editor o propietario. */
  function porRol() {
    const puede = escribe(o.rol());
    mejorar.hidden = !puede || !o.aplicar;
    sugerencias.hidden = !puede || !o.sugerencias;
    bIndice.hidden = !puede;
    if (!puede && interruptor.checked) {
      interruptor.checked = false;
      activarSugerencias(false);
    }
  }

  const ocupado = (/** @type {boolean} */ si) => {
    for (const b of [bExplicar, bResumir, bMejorar]) b.disabled = si;
    bDetener.hidden = !si;
    respuesta.setAttribute('aria-busy', String(si));
  };

  const error = (/** @type {unknown} */ e) => {
    errores.replaceChildren(aviso('error', mensajeIa(e)));
  };

  const mostrar = (/** @type {string} */ md) => {
    respuesta.replaceChildren(renderizar(md));
  };

  async function actualizarUso() {
    try {
      const u = /** @type {{ hoy: { peticiones: number }, topes: { peticionesDia: number } }} */ (await api.solicitar('/ia/uso'));
      uso.textContent = `Hoy: ${String(u.hoy.peticiones)} de ${String(u.topes.peticionesDia)} pedidos de IA.`;
    } catch {
      uso.textContent = '';
    }
  }

  /** Empieza un pedido: limpia lo anterior y devuelve la señal para cancelarlo. */
  function empezar(/** @type {string} */ que) {
    enCurso?.abort();
    enCurso = new AbortController();
    errores.replaceChildren();
    propuesta.hidden = true;
    propuesta.replaceChildren();
    respuesta.replaceChildren();
    estado.textContent = `Generando: ${que}…`;
    ocupado(true);
    return enCurso.signal;
  }

  function terminar(/** @type {AbortSignal} */ senal, /** @type {string} */ texto) {
    if (enCurso?.signal === senal) enCurso = null;
    ocupado(false);
    estado.textContent = texto;
  }

  async function explicar() {
    const s = o.seleccion();
    if (!s || !s.texto.trim()) {
      errores.replaceChildren(aviso('advertencia', 'Selecciona primero el fragmento que quieres que la IA explique.'));
      return;
    }
    const senal = empezar('explicación');
    try {
      const r = /** @type {{ texto: string }} */ (
        await api.solicitar('/ia/explicar', { metodo: 'POST', cuerpo: { documentoId: o.documentoId, contenido: s.texto.slice(0, MAXIMOS.explicar) }, senal })
      );
      mostrar(r.texto);
      anunciar(`Explicación de la IA: ${r.texto}`);
      terminar(senal, s.texto.length > MAXIMOS.explicar ? 'Listo (se explicó solo el principio de la selección).' : 'Listo.');
    } catch (e) {
      if (senal.aborted) return terminar(senal, 'Detenida.');
      error(e);
      terminar(senal, '');
    }
    void actualizarUso();
  }

  /**
   * Resumir o mejorar, en streaming.
   * @param {'resumir' | 'mejorar'} tarea
   */
  async function transformar(tarea) {
    const s = tarea === 'mejorar' ? o.seleccion() : null;
    if (tarea === 'mejorar' && (!s || !s.texto.trim())) {
      errores.replaceChildren(aviso('advertencia', 'Selecciona primero el texto que quieres mejorar.'));
      return;
    }
    const fuente = tarea === 'mejorar' ? (s?.texto ?? '') : o.texto();
    if (!fuente.trim()) {
      errores.replaceChildren(aviso('advertencia', 'El documento está vacío.'));
      return;
    }
    const recortado = fuente.length > MAXIMOS.transformar;
    const senal = empezar(tarea === 'resumir' ? 'resumen' : 'propuesta');
    const frases = crearAnunciadorFrases(anunciar);
    let total = '';
    /** @type {unknown} */
    let fallo = null;
    let fin = false;
    let pintar = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
    try {
      const r = /** @type {Response} */ (
        await api.solicitar(`/ia/${tarea}`, {
          metodo: 'POST',
          cuerpo: { documentoId: o.documentoId, contenido: fuente.slice(0, MAXIMOS.transformar), estilo: estilo.value },
          corriente: true,
          tiempoMaximoMs: TIEMPO_CORRIENTE_MS,
          senal,
        })
      );
      if (!r.body) throw new Error('sin cuerpo');
      await leerSse(r.body, (e) => {
        if (e.evento === 'fragmento') {
          total += /** @type {{ texto: string }} */ (e.datos).texto;
          // Se redibuja a lo sumo cada 100 ms (no por fragmento).
          pintar ??= setTimeout(() => {
            pintar = null;
            mostrar(total);
          }, 100);
          frases.avance(total);
        } else if (e.evento === 'fin') {
          fin = true;
        } else if (e.evento === 'error') {
          fallo = e.datos;
        }
      });
    } catch (e) {
      if (!senal.aborted) fallo = e;
    }
    if (pintar) clearTimeout(pintar);
    mostrar(total);
    if (senal.aborted) {
      terminar(senal, 'Detenida.');
    } else if (fallo || !fin) {
      error(fallo ?? { codigo: 'interno' });
      terminar(senal, '');
    } else {
      frases.fin(total);
      terminar(senal, recortado ? 'Listo (se usó solo el principio del texto: 40 000 caracteres).' : 'Listo.');
      if (tarea === 'mejorar' && s && total.trim()) ofrecer(s, total.trim());
    }
    void actualizarUso();
  }

  /** La propuesta de Mejorar: nunca se aplica sola. */
  function ofrecer(/** @type {Seleccion} */ s, /** @type {string} */ nuevo) {
    const a = o.aplicar;
    if (!a) return;
    const reemplazar = boton('Reemplazar selección');
    const debajo = boton('Insertar debajo');
    const descartar = boton('Descartar');
    const cerrarPropuesta = (/** @type {string} */ texto) => {
      propuesta.hidden = true;
      propuesta.replaceChildren();
      estado.textContent = texto;
    };
    reemplazar.addEventListener('click', () => {
      if (a.reemplazar(s, nuevo)) cerrarPropuesta('Se reemplazó la selección.');
      else errores.replaceChildren(aviso('advertencia', 'El texto seleccionado cambió mientras la IA trabajaba: no se reemplazó. Vuelve a pedir la mejora.'));
    });
    debajo.addEventListener('click', () => {
      a.insertarDebajo(s, nuevo);
      cerrarPropuesta('Se insertó la propuesta debajo.');
    });
    descartar.addEventListener('click', () => cerrarPropuesta('Propuesta descartada.'));
    propuesta.replaceChildren(h('p', {}, 'Propuesta de la IA. No se aplica sola: elige qué hacer.'), h('p', { class: 'acciones' }, reemplazar, ' ', debajo, ' ', descartar));
    propuesta.hidden = false;
    reemplazar.focus();
  }

  /** Sin tope o sin permiso no tiene sentido seguir pidiendo; lo demás (una sugerencia lenta) se ignora. */
  const alErrorSugerencias = (/** @type {string} */ codigo) => {
    if (codigo === 'tope_diario_ia' || codigo === 'sin_permiso' || codigo === 'ia_no_disponible') {
      interruptor.checked = false;
      activarSugerencias(false);
      error({ codigo });
    }
  };

  function activarSugerencias(/** @type {boolean} */ si) {
    const a = o.sugerencias;
    if (!a || si === sugiriendo) return;
    sugiriendo = si;
    estado.textContent = si ? 'Sugerencias de la IA activadas.' : 'Sugerencias de la IA desactivadas.';
    a.poner(si, alErrorSugerencias).catch((e) => {
      // No se pudo cargar el autocompletado (sin red): el interruptor vuelve a apagado.
      sugiriendo = false;
      interruptor.checked = false;
      estado.textContent = '';
      error(e);
    });
  }

  bExplicar.addEventListener('click', () => void explicar());
  bResumir.addEventListener('click', () => void transformar('resumir'));
  bMejorar.addEventListener('click', () => void transformar('mejorar'));
  bDetener.addEventListener('click', () => enCurso?.abort());
  interruptor.addEventListener('change', () => activarSugerencias(interruptor.checked));
  bIndice.addEventListener('click', () => {
    void api.solicitar(`/documentos/${encodeURIComponent(o.documentoId)}/indice`, { metodo: 'POST' }).then(
      () => {
        estado.textContent = 'El índice de búsqueda se actualizará en unos segundos.';
      },
      (e) => error(e),
    );
  });
  const cerrar = () => {
    enCurso?.abort();
    el.hidden = true;
    o.alCerrar();
  };
  bCerrar.addEventListener('click', cerrar);
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !ev.defaultPrevented) {
      ev.preventDefault();
      cerrar();
    }
  });

  const titulo = /** @type {HTMLElement} */ (el.querySelector('h2'));
  titulo.setAttribute('tabindex', '-1');
  /** Muestra el panel (si estaba oculto) con lo que corresponde al rol de ahora. */
  const mostrarPanel = () => {
    if (!el.hidden) return;
    porRol();
    el.hidden = false;
    void actualizarUso();
  };

  return {
    el,
    abierto: () => !el.hidden,
    /** Abre el panel y lleva el foco a su título. */
    abrir() {
      mostrarPanel();
      titulo.focus();
    },
    cerrar,
    /** El rol cambió (llega por el WebSocket): mejorar y sugerencias se ajustan. */
    porRol,
    explicar: () => {
      mostrarPanel();
      return explicar();
    },
    resumir: () => {
      mostrarPanel();
      return transformar('resumir');
    },
    mejorar: (/** @type {Estilo} */ e) => {
      mostrarPanel();
      estilo.value = e;
      return transformar('mejorar');
    },
    destruir() {
      enCurso?.abort();
      activarSugerencias(false);
    },
  };
}
