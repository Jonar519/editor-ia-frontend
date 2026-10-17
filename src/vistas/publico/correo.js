// Confirmar un cambio de correo: #/correo/<token>. El token se borra de la URL ANTES de cualquier
// petición. No se confirma solo al abrir el enlace (un programa que revise enlaces del correo no debe
// poder confirmarlo): hace falta presionar el botón.
import { ErrorApi } from '../../api/errores.js';
import { controlEnvio } from '../../componentes/formulario.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { consumirToken } from '../../token-url.js';

/** @param {Record<string, string>} params */
export function render(params) {
  const token = consumirToken(params.token, '#/correo');
  const seccion = h('section', {}, h('h1', { tabindex: '-1' }, 'Confirmar tu nuevo correo'));
  if (!token) {
    seccion.append(aviso('error', 'Abre el enlace completo del correo que te enviamos a la dirección nueva.'));
    return seccion;
  }
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Confirmar el cambio');
  const form = h('form', { class: 'tarjeta' }, h('p', {}, 'Al confirmar, tu cuenta usará esta dirección para entrar y para los avisos. Te avisaremos también en la dirección anterior.'), boton);
  const envio = controlEnvio(form, boton);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    envio.enviando('Confirmando…');
    void (async () => {
      try {
        await api.solicitar('/cuenta/correo/confirmar', { metodo: 'POST', cuerpo: { token }, sinSesion: true });
        form.replaceWith(
          aviso('exito', 'Tu correo cambió. Desde ahora entra con la dirección nueva.'),
          h('p', {}, h('a', { href: api.usuario() ? '#/cuenta' : '#/entrar' }, api.usuario() ? 'Ver tu cuenta' : 'Entrar')),
        );
      } catch (err) {
        envio.listo();
        if (err instanceof ErrorApi && (err.codigo === 'enlace_invalido' || err.codigo === 'correo_en_uso')) {
          form.replaceWith(aviso('error', err.message));
          return;
        }
        envio.error(err);
      }
    })();
  });

  seccion.append(form);
  return seccion;
}
