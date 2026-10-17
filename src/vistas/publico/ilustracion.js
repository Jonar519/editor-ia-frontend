// Ilustración del hero: un documento ABSTRACTO (barras en lugar de texto, sin nombres, cifras ni fechas)
// con dos marcadores de presencia. Su única parte interactiva es el botón "Otra persona": al activarlo
// aparece la etiqueta (reutiliza la única animación, @keyframes aparecer; sin animación si el sistema
// pide reducir el movimiento) y se anuncia por una región viva.
//
// Colores: solo significados NEUTROS existentes, en sus usos permitidos (significados.json). Las barras
// usan --color-texto-suave por `color` + fill="currentColor"; el marcador es un botón normal.
import { h, s } from '../../dom.js';

/** Barra de "texto": x, y, ancho (en unidades del viewBox de 240 × 200). */
const barra = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ ancho, alto = 6) =>
  s('rect', { x: String(x), y: String(y), width: String(ancho), height: String(alto), rx: '2', fill: 'currentColor' });

function documento() {
  return s(
    'svg',
    { viewBox: '0 0 240 200', class: 'ilustracion-svg', 'aria-hidden': 'true', focusable: 'false' },
    // Título y párrafo
    s('g', { class: 'trazo-fuerte' }, barra(16, 16, 120, 10)),
    s('g', { class: 'trazo' }, barra(16, 40, 208), barra(16, 52, 190), barra(16, 64, 150)),
    // Bloque de código: un contorno (no un fondo) y barras más cortas, sangradas como código.
    s(
      'g',
      { class: 'trazo' },
      s('rect', { x: '16.5', y: '82.5', width: '207', height: '43', rx: '4', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }),
      barra(26, 92, 40),
      barra(72, 92, 70),
      barra(26, 104, 90),
      barra(38, 116, 56),
    ),
    // Párrafo que edita "otra persona"
    s('g', { class: 'trazo' }, barra(16, 140, 120), barra(16, 152, 196)),
    // Línea de tiempo de versiones: solo puntos, sin números ni fechas
    s('g', { class: 'trazo' }, barra(16, 181, 150, 2)),
    s('g', { class: 'trazo-fuerte' }, ...[16, 66, 116, 166].map((cx) => s('circle', { cx: String(cx + 3), cy: '182', r: '4', fill: 'currentColor' }))),
  );
}

export function ilustracion() {
  const etiqueta = h('span', { id: 'etiqueta-otra-persona', class: 'etiqueta-marcador', hidden: true }, 'Otra persona está editando este párrafo');
  const anuncio = h('span', { class: 'solo-lectores', 'aria-live': 'polite' });
  const otra = h(
    'button',
    { type: 'button', class: 'marcador marcador-otra', 'aria-expanded': 'false', 'aria-controls': 'etiqueta-otra-persona' },
    'Otra persona',
  );
  otra.addEventListener('click', () => {
    const abrir = otra.getAttribute('aria-expanded') !== 'true';
    otra.setAttribute('aria-expanded', String(abrir));
    etiqueta.hidden = !abrir;
    anuncio.textContent = abrir ? 'Otra persona está editando este párrafo' : '';
  });

  return h(
    'figure',
    { class: 'ilustracion', 'aria-labelledby': 'titulo-ilustracion' },
    h('figcaption', { id: 'titulo-ilustracion', class: 'ilustracion-titulo' }, 'Ilustración de ejemplo: no es un documento real.'),
    h(
      'div',
      { class: 'ilustracion-lienzo' },
      documento(),
      h('span', { class: 'marcador marcador-tu', 'aria-hidden': 'true' }, 'Tú'),
      h('span', { class: 'marcador-posicion' }, otra, etiqueta),
      anuncio,
    ),
  );
}
