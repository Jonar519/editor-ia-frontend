// Estado de la conexión, siempre a la vista y con texto (el color nunca es el único medio). Es una región
// viva (role="status"): los cambios se anuncian sin mover el foco.
import { h } from '../dom.js';

/** @typedef {import('./conexion.js').EstadoRed} EstadoRed */

/** @type {Record<EstadoRed, { tipo: 'info' | 'exito' | 'advertencia' | 'error', texto: string }>} */
export const TEXTOS_RED = {
  conectando: { tipo: 'info', texto: 'Conectando…' },
  conectado: { tipo: 'exito', texto: 'Conectado. Los cambios llegan al momento.' },
  reconectando: {
    tipo: 'advertencia',
    texto: 'Sin conexión. Reintentando… Lo que escribas se envía al volver la conexión; si cierras la página antes, se pierde.',
  },
  'sin-acceso': { tipo: 'error', texto: 'Ya no tienes acceso a este documento.' },
  borrado: { tipo: 'error', texto: 'Este documento se eliminó.' },
  'sesion-terminada': { tipo: 'error', texto: 'Tu sesión terminó. Entra de nuevo para seguir.' },
  error: { tipo: 'error', texto: 'La conexión se cerró por un error. Recarga la página.' },
};

export function indicadorRed() {
  const texto = h('span', {});
  const el = h('p', { class: 'estado-red aviso aviso-info', role: 'status', 'data-estado': 'conectando' }, h('span', { class: 'aviso-etiqueta' }, 'Conexión:'), ' ', texto);
  return {
    el,
    /** @param {EstadoRed} estado */
    poner(estado) {
      const t = TEXTOS_RED[estado];
      el.className = `estado-red aviso aviso-${t.tipo}`;
      el.dataset.estado = estado;
      texto.textContent = t.texto;
    },
  };
}
