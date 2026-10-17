// Entrar: correo y contraseña; si la cuenta usa MFA, el segundo paso (código TOTP o de respaldo).
// El backend responde lo MISMO exista o no el correo; aquí tampoco se distingue. El desafío del segundo
// paso vive solo en memoria y se consume al primer intento: si falla, se vuelve a empezar.
import { ErrorApi } from '../../api/errores.js';
import { campo, campoContrasena, controlEnvio } from '../../componentes/formulario.js';
import { aviso, h } from '../../dom.js';
import { api, tomarDestino } from '../../sesion.js';
import { normalizarCodigo, normalizarCodigoRespaldo } from '../../validacion.js';

/** @typedef {import('../../api/cliente.js').SesionRespuesta} SesionRespuesta */
/** @typedef {{ mfaRequerido: true, desafio: string, expiraEnSegundos: number }} DesafioMfa */

const irAlDestino = () => {
  window.location.hash = `#${tomarDestino()}`;
};

export function render() {
  const seccion = h('section', { class: 'entrar' });
  if (api.usuario()) {
    irAlDestino();
    return seccion;
  }
  pasoContrasena(seccion);
  return seccion;
}

/**
 * @param {HTMLElement} seccion
 * @param {string} [avisoInicial] un error que trae de vuelta al primer paso
 * @param {string} [correoInicial]
 */
function pasoContrasena(seccion, avisoInicial, correoInicial = '') {
  const correo = campo({ etiqueta: 'Correo', nombre: 'correo', tipo: 'email', autocompletar: 'username', atributos: { maxlength: '254', autocapitalize: 'off', spellcheck: 'false' } });
  correo.input.value = correoInicial;
  const contrasena = campoContrasena({ etiqueta: 'Contraseña', nombre: 'contrasena', autocompletar: 'current-password' });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Entrar');
  const form = h('form', { class: 'tarjeta', novalidate: true }, correo.contenedor, contrasena.contenedor, h('div', { class: 'acciones' }, boton, h('a', { href: '#/recuperar' }, '¿Olvidaste tu contraseña?')));
  const envio = controlEnvio(form, boton);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    correo.error(null);
    contrasena.error(null);
    const c = correo.valor().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) {
      correo.error('Escribe tu correo completo, por ejemplo nombre@example.com.');
      correo.input.focus();
      return;
    }
    if (!contrasena.valor()) {
      contrasena.error('Escribe tu contraseña.');
      contrasena.input.focus();
      return;
    }
    envio.enviando('Entrando…');
    void (async () => {
      try {
        /** @type {SesionRespuesta | DesafioMfa} */
        const r = await api.solicitar('/auth/sesion', { metodo: 'POST', cuerpo: { correo: c, contrasena: contrasena.valor() }, sinSesion: true });
        contrasena.ocultar();
        if ('mfaRequerido' in r) return pasoMfa(seccion, r.desafio, c);
        api.establecerSesion(r);
        irAlDestino();
      } catch (err) {
        envio.listo();
        contrasena.ocultar();
        envio.error(err);
      }
    })();
  });

  seccion.replaceChildren(h('h1', { tabindex: '-1' }, 'Entrar'));
  if (avisoInicial) seccion.append(aviso('error', avisoInicial));
  seccion.append(form, h('p', { class: 'suave' }, 'Las cuentas se crean solo por invitación. Si no tienes una, pídela a la administración de tu espacio.'));
  seccion.querySelector('h1')?.focus();
}

/**
 * @param {HTMLElement} seccion
 * @param {string} desafio
 * @param {string} correoUsado para volver al primer paso sin reescribirlo
 */
function pasoMfa(seccion, desafio, correoUsado) {
  let respaldo = false;
  const codigo = campo({
    etiqueta: 'Código de 6 dígitos',
    nombre: 'codigo',
    autocompletar: 'one-time-code',
    ayuda: 'Ábrelo en tu app autenticadora. Cambia cada 30 segundos.',
    atributos: { inputmode: 'numeric', maxlength: '7', autocapitalize: 'off', spellcheck: 'false' },
  });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Verificar');
  const alternar = h('button', { type: 'button', class: 'boton-enlace' }, 'Usar un código de respaldo');
  const volver = h('button', { type: 'button', class: 'boton-enlace' }, 'Volver a empezar');
  const form = h('form', { class: 'tarjeta', novalidate: true }, codigo.contenedor, h('div', { class: 'acciones' }, boton, alternar));
  const envio = controlEnvio(form, boton);
  const etiqueta = codigo.contenedor.querySelector('label');
  const ayuda = codigo.contenedor.querySelector('.ayuda');

  alternar.addEventListener('click', () => {
    respaldo = !respaldo;
    codigo.error(null);
    codigo.input.value = '';
    if (etiqueta) etiqueta.textContent = respaldo ? 'Código de respaldo' : 'Código de 6 dígitos';
    if (ayuda) ayuda.textContent = respaldo ? 'Uno de los 10 que guardaste al activar la verificación (XXXXX-XXXXX). Cada uno sirve una sola vez.' : 'Ábrelo en tu app autenticadora. Cambia cada 30 segundos.';
    codigo.input.setAttribute('inputmode', respaldo ? 'text' : 'numeric');
    codigo.input.setAttribute('autocomplete', respaldo ? 'off' : 'one-time-code');
    codigo.input.setAttribute('maxlength', respaldo ? '13' : '7');
    alternar.textContent = respaldo ? 'Usar el código de la app' : 'Usar un código de respaldo';
    codigo.input.focus();
  });
  volver.addEventListener('click', () => pasoContrasena(seccion, undefined, correoUsado));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    codigo.error(null);
    const valor = respaldo ? normalizarCodigoRespaldo(codigo.valor()) : normalizarCodigo(codigo.valor());
    if (!valor) {
      codigo.error(respaldo ? 'El código de respaldo tiene 10 letras o números (XXXXX-XXXXX).' : 'El código tiene 6 dígitos.');
      codigo.input.focus();
      return;
    }
    envio.enviando('Verificando…');
    void (async () => {
      try {
        /** @type {SesionRespuesta} */
        const r = await api.solicitar('/auth/mfa', { metodo: 'POST', cuerpo: respaldo ? { desafio, codigoRespaldo: valor } : { desafio, codigo: valor }, sinSesion: true });
        api.establecerSesion(r);
        irAlDestino();
      } catch (err) {
        // El desafío ya se consumió (acierte o no): se vuelve a empezar con el mensaje del servidor.
        if (err instanceof ErrorApi && (err.codigo === 'mfa_invalido' || err.codigo === 'cuenta_bloqueada')) {
          pasoContrasena(seccion, err.estado === 429 ? `${err.message}${err.reintentarEnSegundos ? ` Espera ${String(err.reintentarEnSegundos)} s.` : ''}` : err.message, correoUsado);
          return;
        }
        envio.listo();
        envio.error(err);
      }
    })();
  });

  seccion.replaceChildren(
    h('h1', { tabindex: '-1' }, 'Verificación en dos pasos'),
    h('p', {}, 'Tu cuenta tiene la verificación en dos pasos activa.'),
    form,
    h('p', {}, volver),
  );
  seccion.querySelector('h1')?.focus();
}
