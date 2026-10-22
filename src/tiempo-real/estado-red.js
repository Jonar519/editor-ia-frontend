// Estado de la conexión, siempre a la vista y con texto (el color nunca es el único medio). Es una región
// viva (role="status"): los cambios se anuncian sin mover el foco. Debajo, si hay cambios sin enviar,
// dice dónde están guardados (en el dispositivo o solo en la página).
import { h } from '../dom.js';

/** @typedef {import('./conexion.js').EstadoRed} EstadoRed */
/** @typedef {import('./documento.js').EstadoCopia} EstadoCopia */

/** @type {Record<EstadoRed, { tipo: 'info' | 'exito' | 'advertencia' | 'error', texto: string }>} */
export const TEXTOS_RED = {
  conectando: { tipo: 'info', texto: 'Conectando…' },
  conectado: { tipo: 'exito', texto: 'Conectado. Los cambios llegan al momento.' },
  reconectando: { tipo: 'advertencia', texto: 'Sin conexión. Reintentando… Puedes seguir: lo que escribas se envía al volver la conexión.' },
  'sin-acceso': { tipo: 'error', texto: 'Ya no tienes acceso a este documento.' },
  borrado: { tipo: 'error', texto: 'Este documento se eliminó.' },
  'sesion-terminada': { tipo: 'error', texto: 'Tu sesión terminó. Entra de nuevo para seguir; lo guardado en este dispositivo se envía entonces.' },
  'demasiado-grande': {
    tipo: 'error',
    texto: 'Los cambios sin enviar son demasiado grandes para mandarlos de una vez (más de 1 MiB). Siguen guardados aquí; copia lo que necesites.',
  },
  error: { tipo: 'error', texto: 'La conexión se cerró por un error. Recarga la página.' },
};

/**
 * Qué decir de los cambios sin enviar, según dónde estén guardados.
 * @param {boolean} pendiente @param {EstadoCopia} copia
 */
export function textoPendiente(pendiente, copia) {
  if (!pendiente) return '';
  if (copia === 'con-copia') return 'Hay cambios sin enviar, guardados en este dispositivo: no se pierden si cierras la página.';
  return 'Hay cambios sin enviar, solo en esta página: no se pudieron guardar en el dispositivo y se pierden si la cierras.';
}

export function indicadorRed() {
  const texto = h('span', {});
  const linea = h('p', { class: 'estado-red-linea' }, h('span', { class: 'aviso-etiqueta' }, 'Conexión:'), ' ', texto);
  const pendientes = h('p', { class: 'estado-red-linea', hidden: true });
  const el = h('div', { class: 'estado-red aviso aviso-info', role: 'status', 'data-estado': 'conectando' }, linea, pendientes);
  let pendiente = false;
  /** @type {EstadoCopia} */
  let copia = 'sin-copia';
  const dibujarPendientes = () => {
    const t = textoPendiente(pendiente, copia);
    pendientes.textContent = t;
    pendientes.hidden = t === '';
  };
  return {
    el,
    /** @param {EstadoRed} estado */
    poner(estado) {
      const t = TEXTOS_RED[estado];
      el.className = `estado-red aviso aviso-${t.tipo}`;
      el.dataset.estado = estado;
      texto.textContent = t.texto;
    },
    /** @param {boolean} hay */
    ponerPendiente(hay) {
      pendiente = hay;
      dibujarPendientes();
    },
    /** @param {EstadoCopia} e */
    ponerCopia(e) {
      copia = e;
      dibujarPendientes();
    },
  };
}
