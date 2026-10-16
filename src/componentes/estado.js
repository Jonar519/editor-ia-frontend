// Componente de estados explícitos para cualquier dato que venga del API:
//   cargando → contenido | vacío | error (con "Reintentar").
// "Reintentar" vuelve a hacer la PETICIÓN, sin recargar la página (a diferencia de una vista que no
// cargó por import(), que sí recarga: ver router.js). Cada intento cancela el anterior.
import { mensajeParaPersona } from '../api/errores.js';
import { aviso, h } from '../dom.js';
import { anunciar } from './anunciar.js';

/**
 * @template T
 * @param {{
 *   cargar: (senal: AbortSignal) => Promise<T>,
 *   mostrar: (datos: T) => HTMLElement,
 *   estaVacio?: (datos: T) => boolean,
 *   textoVacio?: string,
 *   textoCargando?: string,
 *   queCarga: string,
 * }} o  queCarga: qué se está cargando, para los mensajes ("tu perfil", "los documentos")
 * @returns {HTMLElement}
 */
export function conDatos(o) {
  const contenedor = h('div', { class: 'con-datos' });
  /** @type {AbortController | null} */
  let actual = null;

  async function intentar() {
    actual?.abort();
    const control = new AbortController();
    actual = control;
    contenedor.setAttribute('aria-busy', 'true');
    contenedor.replaceChildren(h('p', { class: 'cargando', role: 'status' }, o.textoCargando ?? `Cargando ${o.queCarga}…`));
    try {
      const datos = await o.cargar(control.signal);
      if (control.signal.aborted) return;
      contenedor.replaceChildren(o.estaVacio?.(datos) ? h('p', { class: 'vacio' }, o.textoVacio ?? 'No hay nada para mostrar.') : o.mostrar(datos));
    } catch (err) {
      if (control.signal.aborted) return;
      const reintentar = h('button', { class: 'boton', type: 'button' }, 'Reintentar');
      reintentar.addEventListener('click', () => {
        void intentar();
      });
      contenedor.replaceChildren(aviso('error', `No se pudo cargar ${o.queCarga}. ${mensajeParaPersona(err)}`), reintentar);
      anunciar(`No se pudo cargar ${o.queCarga}.`);
    } finally {
      if (actual === control) contenedor.removeAttribute('aria-busy');
    }
  }

  void intentar();
  return contenedor;
}
