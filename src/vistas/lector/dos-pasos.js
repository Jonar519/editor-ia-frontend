// Tu cuenta → Verificación en dos pasos (TOTP):
//   - sin activar: "Activar" → secreto (sin QR, ver docs/revision-bloque-R.md) → primer código → los 10
//     códigos de respaldo, que se muestran UNA sola vez;
//   - activa: generar códigos nuevos (los anteriores dejan de servir) o desactivarla, siempre con un
//     código actual de la app. Una cuenta de administración NO puede desactivarla (el backend responde
//     409 mfa_obligatorio; aquí ni se ofrece).
import { ErrorApi } from '../../api/errores.js';
import { anunciar } from '../../componentes/anunciar.js';
import { conDatos } from '../../componentes/estado.js';
import { campo, controlEnvio } from '../../componentes/formulario.js';
import { bloqueSecreto, mostrarCodigos } from '../../componentes/mfa.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { normalizarCodigo } from '../../validacion.js';
import { cargarPerfil, paginaCuenta } from './comun.js';

/** @typedef {import('./comun.js').Perfil} Perfil */

const CAMINO = '/cuenta/dos-pasos';
const TITULO = 'Verificación en dos pasos';

export function render() {
  /** @type {HTMLElement} */
  const seccion = paginaCuenta(CAMINO, TITULO);
  const redibujar = () => {
    const nueva = render();
    seccion.replaceWith(nueva);
    nueva.querySelector('h1')?.focus();
  };
  seccion.append(conDatos({ queCarga: 'la verificación en dos pasos', cargar: cargarPerfil, mostrar: (p) => (p.mfaActivo ? activa(p, seccion, redibujar) : inactiva(seccion, redibujar)) }));
  return seccion;
}

/** @param {string} etiqueta */
const campoCodigo = (etiqueta) =>
  campo({ etiqueta, nombre: 'codigo', autocompletar: 'one-time-code', ayuda: 'El que muestra ahora tu app autenticadora.', atributos: { inputmode: 'numeric', maxlength: '7' } });

/**
 * Valida el código o marca el campo. @param {import('../../componentes/formulario.js').Campo} c
 * @returns {string | null}
 */
function codigoValido(c) {
  c.error(null);
  const v = normalizarCodigo(c.valor());
  if (!v) {
    c.error('El código tiene 6 dígitos.');
    c.input.focus();
  }
  return v;
}

/**
 * Errores de código que van en el campo; los demás, arriba del formulario.
 * @param {unknown} err @param {import('../../componentes/formulario.js').Campo} c @param {{ error: (e: unknown) => void }} envio
 */
function errorDeCodigo(err, c, envio) {
  if (err instanceof ErrorApi && err.codigo === 'codigo_mfa_invalido') {
    c.error('El código no es válido. Revisa que la hora del teléfono esté bien y usa el código actual.');
    c.input.focus();
    return;
  }
  envio.error(err);
}

/** @param {HTMLElement} seccion @param {() => void} redibujar */
function inactiva(seccion, redibujar) {
  const zona = h('div', {});
  const activar = h('button', { class: 'boton boton-primario', type: 'button' }, 'Activar la verificación en dos pasos');
  const salida = h('div', {});

  async function iniciar() {
    activar.disabled = true;
    salida.replaceChildren();
    try {
      /** @type {{ secreto: string, uri: string }} */
      const m = await api.solicitar('/cuenta/mfa/iniciar', { metodo: 'POST' });
      activar.hidden = true;
      zona.replaceChildren(confirmar(m));
      zona.querySelector('h2')?.focus();
    } catch (err) {
      activar.disabled = false;
      if (err instanceof ErrorApi && err.codigo === 'mfa_ya_activo') return redibujar();
      salida.replaceChildren(aviso('error', `No se pudo empezar. ${err instanceof ErrorApi ? err.message : ''}`));
    }
  }
  activar.addEventListener('click', () => void iniciar());

  /** @param {{ secreto: string, uri: string }} m */
  function confirmar(m) {
    const codigo = campoCodigo('Primer código de 6 dígitos');
    const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Confirmar y activar');
    const form = h(
      'form',
      { class: 'tarjeta', novalidate: true, 'aria-labelledby': 'titulo-configurar' },
      h('h2', { id: 'titulo-configurar', tabindex: '-1' }, 'Agrega la cuenta en tu app'),
      h('p', {}, 'En tu app autenticadora (por ejemplo, la de tu teléfono), agrega una cuenta con este secreto:'),
      ...bloqueSecreto(m),
      codigo.contenedor,
      boton,
    );
    const envio = controlEnvio(form, boton);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const c = codigoValido(codigo);
      if (!c) return;
      envio.enviando('Activando…');
      void (async () => {
        try {
          /** @type {{ codigosRespaldo: string[] }} */
          const r = await api.solicitar('/cuenta/mfa/confirmar', { metodo: 'POST', cuerpo: { codigo: c } });
          anunciar('Activaste la verificación en dos pasos.');
          mostrarCodigos(seccion, r.codigosRespaldo, { alContinuar: redibujar });
        } catch (err) {
          envio.listo();
          // Demasiados códigos incorrectos o la configuración ya no existe: se empieza con un secreto nuevo.
          if (err instanceof ErrorApi && (err.codigo === 'mfa_reiniciar' || err.codigo === 'mfa_no_iniciado')) {
            envio.error(err);
            activar.hidden = false;
            activar.disabled = false;
            zona.replaceChildren();
            salida.replaceChildren(aviso('advertencia', 'Hay que volver a empezar: el secreto anterior ya no sirve. Bórralo de tu app y pulsa «Activar» otra vez.'));
            activar.focus();
            return;
          }
          if (err instanceof ErrorApi && err.codigo === 'mfa_ya_activo') return redibujar();
          errorDeCodigo(err, codigo, envio);
        }
      })();
    });
    return form;
  }

  return h(
    'div',
    {},
    h('p', {}, 'Con la verificación en dos pasos, para entrar hace falta además un código de 6 dígitos que genera una app de tu teléfono. Así, alguien que sepa tu contraseña no puede entrar sin el teléfono.'),
    aviso('info', 'Está desactivada.'),
    h('p', {}, activar),
    salida,
    zona,
  );
}

/** @param {Perfil} p @param {HTMLElement} seccion @param {() => void} redibujar */
function activa(p, seccion, redibujar) {
  // Generar códigos nuevos.
  const codigoNuevos = campoCodigo('Código de 6 dígitos');
  const generar = h('button', { class: 'boton', type: 'submit' }, 'Generar códigos nuevos');
  const formNuevos = h(
    'form',
    { class: 'tarjeta', novalidate: true, 'aria-labelledby': 'titulo-codigos' },
    h('h2', { id: 'titulo-codigos' }, 'Códigos de respaldo'),
    h('p', {}, 'Si usaste varios o crees que alguien los vio, genera 10 nuevos. Los anteriores dejan de servir.'),
    codigoNuevos.contenedor,
    generar,
  );
  const envioNuevos = controlEnvio(formNuevos, generar);
  formNuevos.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const c = codigoValido(codigoNuevos);
    if (!c) return;
    envioNuevos.enviando('Generando…');
    void (async () => {
      try {
        /** @type {{ codigosRespaldo: string[] }} */
        const r = await api.solicitar('/cuenta/mfa/codigos-respaldo', { metodo: 'POST', cuerpo: { codigo: c } });
        mostrarCodigos(seccion, r.codigosRespaldo, { alContinuar: redibujar });
      } catch (err) {
        envioNuevos.listo();
        errorDeCodigo(err, codigoNuevos, envioNuevos);
      }
    })();
  });

  // Desactivar (no para administración).
  /** @type {HTMLElement} */
  let zonaDesactivar;
  if (p.rol === 'admin') {
    zonaDesactivar = h('div', { class: 'tarjeta' }, h('h2', {}, 'Desactivar'), aviso('info', 'Para una cuenta de administración la verificación en dos pasos es obligatoria: no se puede desactivar.'));
  } else {
    const codigoQuitar = campoCodigo('Código de 6 dígitos');
    const desactivar = h('button', { class: 'boton boton-peligro', type: 'submit' }, 'Desactivar la verificación en dos pasos');
    const formQuitar = h(
      'form',
      { class: 'tarjeta', novalidate: true, 'aria-labelledby': 'titulo-desactivar' },
      h('h2', { id: 'titulo-desactivar' }, 'Desactivar'),
      h('p', {}, 'Para entrar volverá a bastar la contraseña. Tus códigos de respaldo dejan de servir.'),
      codigoQuitar.contenedor,
      desactivar,
    );
    const envioQuitar = controlEnvio(formQuitar, desactivar);
    formQuitar.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const c = codigoValido(codigoQuitar);
      if (!c) return;
      envioQuitar.enviando('Desactivando…');
      void (async () => {
        try {
          await api.solicitar('/cuenta/mfa', { metodo: 'DELETE', cuerpo: { codigo: c } });
          anunciar('Desactivaste la verificación en dos pasos.');
          redibujar();
        } catch (err) {
          envioQuitar.listo();
          errorDeCodigo(err, codigoQuitar, envioQuitar);
        }
      })();
    });
    zonaDesactivar = formQuitar;
  }

  return h('div', {}, aviso('exito', 'Está activa: para entrar se pide un código de tu app.'), formNuevos, zonaDesactivar);
}
