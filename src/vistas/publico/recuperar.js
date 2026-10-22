// Recuperar la contraseña. Dos rutas en un módulo:
//   #/recuperar          pedir el enlace (la respuesta es la MISMA exista o no el correo)
//   #/recuperar/<token>  elegir la contraseña nueva. El token se borra de la URL ANTES de cualquier
//                        petición; restablecer cierra todas las sesiones de la cuenta.
import { ErrorApi } from '../../api/errores.js';
import { campo, campoContrasena, controlEnvio, detallesComoLista } from '../../componentes/formulario.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { borrarDatosLocales } from '../../tiempo-real/borrar-local.js';
import { consumirToken } from '../../token-url.js';
import { problemaContrasenaNueva } from '../../validacion.js';

/** @param {Record<string, string>} params */
export function render(params) {
  if ('token' in params) return completar(consumirToken(params.token, '#/recuperar'));
  return pedir();
}

function pedir() {
  const seccion = h('section', {});
  const correo = campo({ etiqueta: 'Correo de tu cuenta', nombre: 'correo', tipo: 'email', autocompletar: 'username', atributos: { maxlength: '254', autocapitalize: 'off', spellcheck: 'false' } });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Enviar el enlace');
  const form = h('form', { class: 'tarjeta', novalidate: true }, correo.contenedor, h('div', { class: 'acciones' }, boton, h('a', { href: '#/entrar' }, 'Volver a entrar')));
  const envio = controlEnvio(form, boton);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    correo.error(null);
    const c = correo.valor().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) {
      correo.error('Escribe tu correo completo, por ejemplo nombre@example.com.');
      correo.input.focus();
      return;
    }
    envio.enviando('Enviando…');
    void (async () => {
      try {
        /** @type {{ mensaje: string }} */
        const r = await api.solicitar('/auth/recuperacion', { metodo: 'POST', cuerpo: { correo: c }, sinSesion: true });
        const listo = aviso('exito', `${r.mensaje} El enlace vence en 15 minutos.`);
        form.replaceWith(listo, h('p', {}, h('a', { href: '#/entrar' }, 'Volver a entrar')));
      } catch (err) {
        envio.listo();
        envio.error(err);
      }
    })();
  });

  seccion.append(
    h('h1', { tabindex: '-1' }, 'Recuperar la contraseña'),
    h('p', {}, 'Te enviaremos un enlace para elegir una contraseña nueva. Al usarlo se cierran todas tus sesiones.'),
    form,
  );
  return seccion;
}

/** @param {string | null} token */
function completar(token) {
  const seccion = h('section', {}, h('h1', { tabindex: '-1' }, 'Elegir una contraseña nueva'));
  if (!token) {
    seccion.append(aviso('error', 'El enlace no es válido. Pide uno nuevo.'), h('p', {}, h('a', { href: '#/recuperar' }, 'Pedir un enlace nuevo')));
    return seccion;
  }
  const nueva = campoContrasena({ etiqueta: 'Contraseña nueva', nombre: 'nueva', autocompletar: 'new-password', ayuda: 'Al menos 12 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.' });
  const repetir = campoContrasena({ etiqueta: 'Repite la contraseña nueva', nombre: 'repetir', autocompletar: 'new-password' });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Guardar la contraseña');
  const form = h('form', { class: 'tarjeta', novalidate: true }, nueva.contenedor, repetir.contenedor, boton);
  const envio = controlEnvio(form, boton);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    nueva.error(null);
    repetir.error(null);
    const p = problemaContrasenaNueva(nueva.valor(), repetir.valor());
    if (p) {
      const c = p.campo === 'nueva' ? nueva : repetir;
      c.error(p.mensaje);
      c.input.focus();
      return;
    }
    envio.enviando('Guardando…');
    void (async () => {
      try {
        await api.solicitar('/auth/recuperacion/completar', { metodo: 'POST', cuerpo: { token, contrasena: nueva.valor() }, sinSesion: true });
        // Restablecer cerró TODAS las sesiones, también la de esta pestaña si la había. La copia local de
        // los documentos también se borra (restablecer puede deberse a que otra persona entró).
        api.olvidarSesion();
        await borrarDatosLocales();
        form.replaceWith(aviso('exito', 'Tu contraseña cambió y se cerraron todas tus sesiones.'), h('p', {}, h('a', { class: 'boton boton-primario', href: '#/entrar' }, 'Entrar')));
      } catch (err) {
        envio.listo();
        nueva.ocultar();
        repetir.ocultar();
        if (err instanceof ErrorApi && err.codigo === 'enlace_invalido') {
          form.replaceWith(aviso('error', err.message), h('p', {}, h('a', { href: '#/recuperar' }, 'Pedir un enlace nuevo')));
          return;
        }
        envio.error(err, detallesComoLista(err));
      }
    })();
  });

  seccion.append(form);
  return seccion;
}
