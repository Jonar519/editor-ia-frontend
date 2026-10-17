// Tu cuenta → Foto: se elige una imagen, se recorta en un cuadrado EN EL NAVEGADOR y se sube ya
// recortada (512 × 512 px como máximo). Volver a codificarla con un canvas además descarta los metadatos
// de la cámara (ubicación, modelo); el servidor igual los limpia por su cuenta.
//
// El recorte se maneja con tres controles deslizantes (zoom, horizontal, vertical): funcionan con el
// teclado y con lectores de pantalla. Arrastrar sobre la vista previa hace lo mismo con el puntero.
import { conDatos } from '../../componentes/estado.js';
import { campo, controlEnvio } from '../../componentes/formulario.js';
import { h } from '../../dom.js';
import {
  BYTES_MAXIMOS_AVATAR,
  BYTES_MAXIMOS_ORIGEN,
  LADO_AVATAR,
  LADO_AVATAR_RESPALDO,
  recorteCuadrado,
  tipoDeSalida,
  ZOOM_MAXIMO,
} from '../../reglas-cuenta.js';
import { api } from '../../sesion.js';
import { cargarPerfil, lugarAvatar, paginaCuenta, resultado } from './comun.js';

/** @typedef {import('./comun.js').Perfil} Perfil */

/** Lado de la vista previa en pantalla (px CSS). */
const LADO_VISTA = 256;

export function render() {
  return paginaCuenta('/cuenta/foto', 'Foto de perfil', conDatos({ queCarga: 'tu foto', cargar: cargarPerfil, mostrar: editor }));
}

/**
 * Un control deslizante con etiqueta visible.
 * @param {string} etiqueta @param {string} nombre @param {number} min @param {number} max @param {number} paso @param {number} valor
 */
function deslizador(etiqueta, nombre, min, max, paso, valor) {
  return campo({ etiqueta, nombre, tipo: 'range', requerido: false, atributos: { min: String(min), max: String(max), step: String(paso), value: String(valor) } });
}

/**
 * Codifica el recorte. Si un PNG pasara de 1 MiB a 512 px, se usa 256 px (256² × 4 bytes nunca llega).
 * @param {ImageBitmap} imagen
 * @param {{ sx: number, sy: number, lado: number }} r
 * @param {'image/png' | 'image/jpeg'} tipo
 * @returns {Promise<Blob>}
 */
async function codificar(imagen, r, tipo) {
  for (const maximo of [LADO_AVATAR, LADO_AVATAR_RESPALDO]) {
    const lado = Math.min(maximo, r.lado); // una imagen chica no se agranda
    const lienzo = h('canvas', { width: String(lado), height: String(lado) });
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('canvas sin contexto 2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imagen, r.sx, r.sy, r.lado, r.lado, 0, 0, lado, lado);
    const blob = await /** @type {Promise<Blob | null>} */ (new Promise((listo) => lienzo.toBlob(listo, tipo, 0.9)));
    if (!blob) throw new Error('no se pudo codificar la imagen');
    if (blob.size <= BYTES_MAXIMOS_AVATAR) return blob;
  }
  throw new Error('la imagen recortada pesa más de 1 MiB');
}

/** @param {Perfil} p */
function editor(p) {
  let actual = lugarAvatar(p);
  const archivo = campo({
    etiqueta: 'Elegir una imagen',
    nombre: 'imagen',
    tipo: 'file',
    requerido: false,
    ayuda: `JPEG o PNG. Se recorta en un cuadrado y se sube a ${String(LADO_AVATAR)} × ${String(LADO_AVATAR)} px como máximo, sin los datos de la cámara (ubicación, modelo).`,
    atributos: { accept: 'image/jpeg,image/png' },
  });
  const zoom = deslizador('Zoom', 'zoom', 1, ZOOM_MAXIMO, 0.01, 1);
  const horizontal = deslizador('Posición horizontal', 'horizontal', 0, 100, 1, 50);
  const vertical = deslizador('Posición vertical', 'vertical', 0, 100, 1, 50);
  const vista = h('canvas', { class: 'recorte', width: String(LADO_VISTA), height: String(LADO_VISTA), role: 'img', 'aria-label': 'Vista previa del recorte' });
  const zonaRecorte = h('div', { class: 'zona-recorte', hidden: true }, vista, zoom.contenedor, horizontal.contenedor, vertical.contenedor);
  const guardar = h('button', { class: 'boton boton-primario', type: 'submit', disabled: true }, 'Guardar la foto');
  const salida = h('div', {});
  const form = h('form', { class: 'tarjeta', novalidate: true, 'aria-labelledby': 'titulo-foto-nueva' }, h('h2', { id: 'titulo-foto-nueva' }, 'Foto nueva'), archivo.contenedor, zonaRecorte, guardar, salida);
  const envio = controlEnvio(form, guardar);

  /** @type {{ imagen: ImageBitmap, tipo: 'image/png' | 'image/jpeg' } | null} */
  let elegida = null;
  const parametros = () => ({ zoom: Number(zoom.valor()), x: Number(horizontal.valor()) / 100, y: Number(vertical.valor()) / 100 });

  function dibujar() {
    if (!elegida) return;
    const r = recorteCuadrado(elegida.imagen.width, elegida.imagen.height, parametros());
    const ctx = vista.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, LADO_VISTA, LADO_VISTA);
    ctx.drawImage(elegida.imagen, r.sx, r.sy, r.lado, r.lado, 0, 0, LADO_VISTA, LADO_VISTA);
  }
  for (const c of [zoom, horizontal, vertical]) c.input.addEventListener('input', dibujar);

  // Arrastrar la vista previa mueve el recorte (lo mismo que los deslizadores, que se actualizan).
  /** @type {{ x: number, y: number, h: number, v: number } | null} */
  let arrastre = null;
  vista.addEventListener('pointerdown', (ev) => {
    if (!elegida) return;
    vista.setPointerCapture(ev.pointerId);
    arrastre = { x: ev.clientX, y: ev.clientY, h: Number(horizontal.valor()), v: Number(vertical.valor()) };
  });
  vista.addEventListener('pointermove', (ev) => {
    if (!arrastre) return;
    // Arrastrar hacia la derecha muestra lo que está a la izquierda (como mover una foto bajo un marco).
    horizontal.input.value = String(Math.round(arrastre.h - ((ev.clientX - arrastre.x) / LADO_VISTA) * 100));
    vertical.input.value = String(Math.round(arrastre.v - ((ev.clientY - arrastre.y) / LADO_VISTA) * 100));
    dibujar();
  });
  const soltar = () => {
    arrastre = null;
  };
  vista.addEventListener('pointerup', soltar);
  vista.addEventListener('pointercancel', soltar);

  archivo.input.addEventListener('change', () => {
    archivo.error(null);
    salida.replaceChildren();
    elegida?.imagen.close();
    elegida = null;
    guardar.disabled = true;
    zonaRecorte.hidden = true;
    const f = archivo.input.files?.[0];
    if (!f) return;
    const tipo = tipoDeSalida(f.type);
    if (!tipo) return archivo.error('Elige una imagen JPEG o PNG.');
    if (f.size > BYTES_MAXIMOS_ORIGEN) return archivo.error('La imagen pesa más de 20 MB. Elige una más liviana.');
    void createImageBitmap(f).then(
      (imagen) => {
        elegida = { imagen, tipo };
        for (const [c, v] of /** @type {const} */ ([[zoom, '1'], [horizontal, '50'], [vertical, '50']])) c.input.value = v;
        zonaRecorte.hidden = false;
        guardar.disabled = false;
        dibujar();
      },
      () => archivo.error('No se pudo leer la imagen. Prueba con otra.'),
    );
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!elegida) return;
    const { imagen, tipo } = elegida;
    envio.enviando('Subiendo…');
    void (async () => {
      try {
        const blob = await codificar(imagen, recorteCuadrado(imagen.width, imagen.height, parametros()), tipo);
        /** @type {{ ancho: number, alto: number, hash: string }} */
        const r = await api.solicitar('/cuenta/avatar', { metodo: 'PUT', binario: blob });
        p = { ...p, avatar: { tipo, ancho: r.ancho, alto: r.alto, hash: r.hash } };
        const nuevo = lugarAvatar(p);
        actual.replaceWith(nuevo);
        actual = nuevo;
        envio.listo();
        resultado(salida, 'exito', 'Guardamos tu foto nueva.');
        quitar.hidden = false;
      } catch (err) {
        envio.listo();
        envio.error(err);
      }
    })();
  });

  const quitar = h('button', { class: 'boton boton-peligro', type: 'button', hidden: !p.avatar }, 'Quitar la foto');
  const salidaQuitar = h('div', {});
  quitar.addEventListener('click', () => {
    quitar.disabled = true;
    void api.solicitar('/cuenta/avatar', { metodo: 'DELETE' }).then(
      () => {
        p = { ...p, avatar: null };
        const nuevo = lugarAvatar(p);
        actual.replaceWith(nuevo);
        actual = nuevo;
        quitar.disabled = false;
        quitar.hidden = true;
        resultado(salidaQuitar, 'exito', 'Quitamos tu foto.');
      },
      (/** @type {unknown} */ err) => {
        quitar.disabled = false;
        envio.error(err);
      },
    );
  });

  return h('div', {}, h('h2', {}, 'Foto actual'), actual, h('p', {}, quitar), salidaQuitar, form);
}
