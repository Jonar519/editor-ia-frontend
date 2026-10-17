// Piezas de formulario accesibles: etiqueta visible ligada al campo, ayuda y error asociados con
// aria-describedby, aria-invalid, un resumen de error con foco (role="alert") y un estado "enviando" que
// evita el doble envío. El error se nombra con texto ("Error:"), no solo con color.
import { mensajeParaPersona } from '../api/errores.js';
import { aviso, h } from '../dom.js';

let contador = 0;
const idNuevo = (/** @type {string} */ base) => `${base}-${String(++contador)}`;

/**
 * @typedef {{ contenedor: HTMLElement, input: HTMLInputElement, error: (texto: string | null) => void, valor: () => string }} Campo
 */

/**
 * @param {{
 *   etiqueta: string, nombre: string, tipo?: string, autocompletar?: string, ayuda?: string,
 *   requerido?: boolean, atributos?: Record<string, string | boolean | undefined>
 * }} o
 * @returns {Campo}
 */
export function campo(o) {
  const id = idNuevo(o.nombre);
  const ayuda = o.ayuda ? h('p', { id: `${id}-ayuda`, class: 'ayuda' }, o.ayuda) : null;
  const errorEl = h('p', { id: `${id}-error`, class: 'error-campo', hidden: true });
  const input = h('input', {
    id,
    name: o.nombre,
    type: o.tipo ?? 'text',
    autocomplete: o.autocompletar,
    required: o.requerido ?? true,
    'aria-describedby': [ayuda ? `${id}-ayuda` : '', `${id}-error`].filter(Boolean).join(' '),
    ...o.atributos,
  });
  const contenedor = h('div', { class: 'campo' }, h('label', { for: id }, o.etiqueta), input, ayuda, errorEl);
  return {
    contenedor,
    input,
    valor: () => input.value,
    error: (texto) => {
      if (texto) {
        input.setAttribute('aria-invalid', 'true');
        errorEl.replaceChildren(h('span', { class: 'aviso-etiqueta' }, 'Error:'), ` ${texto}`);
        errorEl.hidden = false;
      } else {
        input.removeAttribute('aria-invalid');
        errorEl.replaceChildren();
        errorEl.hidden = true;
      }
    },
  };
}

/**
 * Campo de contraseña con "Mostrar" (aria-pressed). Mostrarla ayuda a escribir una frase larga sin
 * errores; vuelve a ocultarse al enviar.
 * @param {{ etiqueta: string, nombre: string, autocompletar: 'current-password' | 'new-password', ayuda?: string }} o
 * @returns {Campo & { ocultar: () => void }}
 */
export function campoContrasena(o) {
  const c = campo({ ...o, tipo: 'password', atributos: { maxlength: '128', spellcheck: 'false', autocapitalize: 'off' } });
  const boton = h('button', { type: 'button', class: 'boton boton-chico', 'aria-pressed': 'false', 'aria-controls': c.input.id }, 'Mostrar');
  const ocultar = () => {
    c.input.type = 'password';
    boton.setAttribute('aria-pressed', 'false');
  };
  boton.addEventListener('click', () => {
    const ver = c.input.type === 'password';
    c.input.type = ver ? 'text' : 'password';
    boton.setAttribute('aria-pressed', String(ver));
  });
  c.input.after(boton);
  return { ...c, ocultar };
}

/**
 * Controla el envío: deshabilita el botón (sin doble envío), muestra el error arriba del formulario con
 * el foco puesto ahí, y lo limpia al reintentar.
 * @param {HTMLFormElement} form
 * @param {HTMLButtonElement} boton
 */
export function controlEnvio(form, boton) {
  const resumen = h('div', { class: 'resumen-error', tabindex: '-1' });
  form.prepend(resumen);
  const textoOriginal = boton.textContent ?? '';
  return {
    /** @param {string} texto */
    enviando(texto) {
      resumen.replaceChildren();
      boton.disabled = true;
      boton.setAttribute('aria-busy', 'true');
      boton.textContent = texto;
    },
    listo() {
      boton.disabled = false;
      boton.removeAttribute('aria-busy');
      boton.textContent = textoOriginal;
    },
    /**
     * @param {unknown} err  un ErrorApi o un texto
     * @param {string[]} [lista] detalles a enumerar (por ejemplo, lo que falla de una contraseña)
     */
    error(err, lista) {
      const texto = typeof err === 'string' ? err : mensajeParaPersona(err);
      resumen.replaceChildren(aviso('error', texto));
      if (lista?.length) resumen.append(h('ul', { class: 'lista-errores' }, ...lista.map((x) => h('li', {}, x))));
      resumen.focus();
    },
  };
}

/** Detalles de un error del API que sean una lista de textos (por ejemplo, contrasena_debil). */
export function detallesComoLista(/** @type {unknown} */ err) {
  const d = /** @type {{ detalles?: unknown }} */ (err ?? {}).detalles;
  return Array.isArray(d) && d.every((x) => typeof x === 'string') ? /** @type {string[]} */ (d) : [];
}
