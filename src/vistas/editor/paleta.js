// Paleta de comandos (Ctrl+K, bloque O): un diálogo modal con un campo que filtra los comandos (patrón
// combobox de ARIA: el foco se queda en el campo y la opción activa se anuncia con aria-activedescendant).
// Flechas para moverse, Enter para aplicar, Escape para cerrar; al cerrar, el foco vuelve al editor.
import { h } from '../../dom.js';
import { atajoLegible, filtrar } from './comandos.js';

/**
 * @typedef {{ id: string, nombre: string, palabras: string, atajo?: string, aplicar: () => void }} Accion
 */

let abierta = false;

/**
 * Abre la paleta con estas acciones. `alCerrar` se llama siempre al cerrar (para devolver el foco).
 * @param {{ acciones: Accion[], alCerrar: () => void }} o
 */
export function abrirPaleta(o) {
  if (abierta) return;
  abierta = true;
  const campo = h('input', {
    id: 'paleta-campo',
    type: 'text',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'paleta-lista',
    'aria-autocomplete': 'list',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const lista = h('ul', { id: 'paleta-lista', role: 'listbox', 'aria-label': 'Comandos' });
  const estado = h('p', { class: 'solo-lectores', role: 'status' });
  const dialogo = h(
    'dialog',
    { class: 'dialogo paleta', 'aria-labelledby': 'paleta-titulo' },
    h('h2', { id: 'paleta-titulo' }, 'Comandos'),
    h('label', { for: 'paleta-campo' }, 'Busca un comando'),
    campo,
    lista,
    estado,
  );
  /** @type {Accion[]} */
  let visibles = [];
  let activa = 0;

  const dibujar = () => {
    visibles = filtrar(o.acciones, campo.value);
    activa = Math.min(activa, Math.max(visibles.length - 1, 0));
    lista.replaceChildren(
      ...visibles.map((a, i) => {
        const li = h(
          'li',
          { id: `paleta-${a.id}`, role: 'option', 'aria-selected': String(i === activa), class: i === activa ? 'opcion opcion-activa' : 'opcion' },
          a.nombre,
          a.atajo ? h('span', { class: 'atajo' }, ` ${atajoLegible(a.atajo)}`) : null,
        );
        li.addEventListener('mousedown', (ev) => ev.preventDefault()); // el foco se queda en el campo
        li.addEventListener('click', () => elegir(i));
        return li;
      }),
    );
    const actual = visibles[activa];
    if (actual) campo.setAttribute('aria-activedescendant', `paleta-${actual.id}`);
    else campo.removeAttribute('aria-activedescendant');
    estado.textContent = visibles.length === 0 ? 'Ningún comando coincide.' : `${String(visibles.length)} comandos.`;
  };

  const cerrar = () => {
    if (!abierta) return;
    abierta = false;
    dialogo.close();
    dialogo.remove();
    o.alCerrar();
  };
  const elegir = (/** @type {number} */ i) => {
    const a = visibles[i];
    cerrar();
    a?.aplicar();
  };

  campo.addEventListener('input', () => {
    activa = 0;
    dibujar();
  });
  campo.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (visibles.length) activa = (activa + (ev.key === 'ArrowDown' ? 1 : -1) + visibles.length) % visibles.length;
      dibujar();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (visibles.length) elegir(activa);
    }
  });
  dialogo.addEventListener('cancel', (ev) => {
    ev.preventDefault();
    cerrar();
  });
  document.body.append(dialogo);
  dibujar();
  dialogo.showModal();
  campo.focus();
}
