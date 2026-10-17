// Tu cuenta → Correo: pedir el cambio. Hace falta la contraseña (un access token robado no basta). El
// servidor responde SIEMPRE lo mismo, esté o no en uso la dirección nueva: así no se puede averiguar
// quién tiene cuenta. El cambio se completa al abrir el enlace que llega a la dirección NUEVA
// (#/correo/<token>, bloque I); hasta entonces el correo actual sigue funcionando.
import { ErrorApi } from '../../api/errores.js';
import { conDatos } from '../../componentes/estado.js';
import { campo, campoContrasena, controlEnvio, erroresEnCampos } from '../../componentes/formulario.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { cargarPerfil, fechaHora, paginaCuenta, resultado } from './comun.js';

/** @typedef {import('./comun.js').Perfil} Perfil */

export function render() {
  return paginaCuenta('/cuenta/correo', 'Cambiar el correo', conDatos({ queCarga: 'tu correo', cargar: cargarPerfil, mostrar: formulario }));
}

/** @param {Perfil} p */
function formulario(p) {
  const correoNuevo = campo({ etiqueta: 'Correo nuevo', nombre: 'correoNuevo', tipo: 'email', autocompletar: 'email', atributos: { maxlength: '254', spellcheck: 'false', autocapitalize: 'off' } });
  const contrasena = campoContrasena({ etiqueta: 'Tu contraseña actual', nombre: 'contrasena', autocompletar: 'current-password', ayuda: 'Para confirmar que eres tú.' });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Enviar el enlace');
  const salida = h('div', {});
  const form = h('form', { class: 'tarjeta', novalidate: true, 'aria-label': 'Pedir el cambio de correo' }, correoNuevo.contenedor, contrasena.contenedor, boton, salida);
  const envio = controlEnvio(form, boton);
  const pendiente = p.cambioCorreoPendiente;

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    correoNuevo.error(null);
    contrasena.error(null);
    salida.replaceChildren();
    const nuevo = correoNuevo.valor().trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(nuevo)) {
      correoNuevo.error('Escribe una dirección de correo completa, por ejemplo nombre@example.com.');
      correoNuevo.input.focus();
      return;
    }
    if (nuevo.toLowerCase() === p.correo.toLowerCase()) {
      correoNuevo.error('Ese ya es tu correo.');
      correoNuevo.input.focus();
      return;
    }
    if (contrasena.valor() === '') {
      contrasena.error('Escribe tu contraseña actual.');
      contrasena.input.focus();
      return;
    }
    envio.enviando('Enviando…');
    void (async () => {
      try {
        /** @type {{ mensaje: string }} */
        const r = await api.solicitar('/cuenta/correo', { metodo: 'POST', cuerpo: { correoNuevo: nuevo, contrasena: contrasena.valor() } });
        contrasena.ocultar();
        contrasena.input.value = '';
        envio.listo();
        resultado(salida, 'exito', `${r.mensaje} Tu correo actual (${p.correo}) sigue funcionando hasta que abras el enlace.`);
      } catch (err) {
        envio.listo();
        contrasena.ocultar();
        if (err instanceof ErrorApi && err.codigo === 'contrasena_incorrecta') {
          contrasena.error('La contraseña no es correcta.');
          contrasena.input.focus();
          return;
        }
        if (err instanceof ErrorApi && err.codigo === 'mismo_correo') {
          correoNuevo.error('Ese ya es tu correo.');
          correoNuevo.input.focus();
          return;
        }
        if (!erroresEnCampos(err, { correoNuevo, contrasena })) envio.error(err);
      }
    })();
  });

  return h(
    'div',
    {},
    h('dl', { class: 'datos' }, h('dt', {}, 'Correo actual'), h('dd', {}, p.correo)),
    pendiente
      ? h('div', { class: 'aviso aviso-info', role: 'status' }, h('span', { class: 'aviso-etiqueta' }, 'Información:'), ` Ya pediste cambiarlo a ${pendiente.correoNuevo}; el enlace vence el `, fechaHora(pendiente.expiraEn), '.')
      : null,
    h('p', {}, 'Si la dirección nueva se puede usar, le llega un enlace. El cambio se hace cuando lo abras.'),
    aviso('info', 'Si no llega en unos minutos, revisa la carpeta de correo no deseado.'),
    form,
  );
}
