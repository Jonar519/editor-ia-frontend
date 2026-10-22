// Tu cuenta → Tus datos: descargar todo lo de la cuenta (JSON) y eliminarla. Las dos piden la contraseña;
// eliminar pide además el código de la app si la verificación en dos pasos está activa.
//
// Si la cuenta es propietaria de documentos o espacios que comparte, el backend responde 409
// propiedad_compartida con la lista: se muestra con nombres para saber qué transferir antes.
import { ErrorApi } from '../../api/errores.js';
import { conDatos } from '../../componentes/estado.js';
import { campo, campoContrasena, controlEnvio } from '../../componentes/formulario.js';
import { dejarDespedida } from '../../despedida.js';
import { aviso, h } from '../../dom.js';
import { bloqueosDeEliminacion } from '../../reglas-cuenta.js';
import { api } from '../../sesion.js';
import { borrarDatosLocales } from '../../tiempo-real/borrar-local.js';
import { normalizarCodigo } from '../../validacion.js';
import { cargarPerfil, paginaCuenta, resultado } from './comun.js';

/** @typedef {import('./comun.js').Perfil} Perfil */

export function render() {
  return paginaCuenta('/cuenta/datos', 'Tus datos', exportar(), conDatos({ queCarga: 'tu cuenta', cargar: cargarPerfil, mostrar: eliminar }));
}

/**
 * @param {import('../../componentes/formulario.js').Campo & { ocultar: () => void }} c
 * @param {unknown} err
 */
function contrasenaIncorrecta(c, err) {
  if (!(err instanceof ErrorApi) || err.codigo !== 'contrasena_incorrecta') return false;
  c.error('La contraseña no es correcta.');
  c.input.focus();
  return true;
}

function exportar() {
  const contrasena = campoContrasena({ etiqueta: 'Tu contraseña', nombre: 'contrasena-exportar', autocompletar: 'current-password' });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Descargar mis datos');
  const salida = h('div', {});
  const form = h(
    'form',
    { class: 'tarjeta', novalidate: true, 'aria-labelledby': 'titulo-exportar' },
    h('h2', { id: 'titulo-exportar' }, 'Descargar tus datos'),
    h('p', {}, 'Un archivo JSON con tu perfil y tu foto, los espacios donde participas, los documentos que son tuyos, tus comentarios, tus sesiones, tu historial de seguridad y tu uso del asistente.'),
    contrasena.contenedor,
    boton,
    salida,
  );
  const envio = controlEnvio(form, boton);
  /** @type {string | null} */
  let enlaceAnterior = null;

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    contrasena.error(null);
    salida.replaceChildren();
    if (contrasena.valor() === '') {
      contrasena.error('Escribe tu contraseña.');
      contrasena.input.focus();
      return;
    }
    envio.enviando('Preparando el archivo…');
    void (async () => {
      try {
        /** @type {import('../../api/cliente.js').Archivo} */
        const a = await api.solicitar('/cuenta/exportacion', { metodo: 'POST', cuerpo: { contrasena: contrasena.valor() }, comoArchivo: true });
        contrasena.ocultar();
        contrasena.input.value = '';
        envio.listo();
        if (enlaceAnterior) URL.revokeObjectURL(enlaceAnterior);
        enlaceAnterior = URL.createObjectURL(a.blob);
        const nombre = a.nombre ?? 'cuaderno-datos.json';
        const enlace = h('a', { href: enlaceAnterior, download: nombre }, `Descargar ${nombre} otra vez`);
        resultado(salida, 'exito', `Tus datos están listos: ${nombre}.`);
        salida.append(h('p', {}, enlace));
        enlace.click();
      } catch (err) {
        envio.listo();
        contrasena.ocultar();
        if (!contrasenaIncorrecta(contrasena, err)) envio.error(err);
      }
    })();
  });
  return form;
}

/** @param {Perfil} p */
function eliminar(p) {
  const contrasena = campoContrasena({ etiqueta: 'Tu contraseña', nombre: 'contrasena-eliminar', autocompletar: 'current-password' });
  const codigo = campo({ etiqueta: 'Código de 6 dígitos de tu app', nombre: 'codigo', autocompletar: 'one-time-code', atributos: { inputmode: 'numeric', maxlength: '7' } });
  const entiendo = h('input', { type: 'checkbox', id: 'entiendo-eliminar' });
  const boton = h('button', { class: 'boton boton-peligro', type: 'submit' }, 'Eliminar mi cuenta');
  const form = h(
    'form',
    { class: 'tarjeta', novalidate: true, 'aria-labelledby': 'titulo-eliminar' },
    h('h2', { id: 'titulo-eliminar' }, 'Eliminar tu cuenta'),
    aviso('advertencia', 'No se puede deshacer.'),
    h(
      'ul',
      {},
      h('li', {}, 'Se borran tu nombre, tu correo, tu teléfono, tu foto, tus sesiones y tu verificación en dos pasos.'),
      h('li', {}, 'Se borran los espacios donde eres el único miembro, con sus documentos.'),
      h('li', {}, 'Lo que escribiste en espacios compartidos se queda, sin tu nombre.'),
      h('li', {}, 'Si eres propietaria o propietario de algo compartido, primero hay que transferirlo: te diremos qué.'),
    ),
    contrasena.contenedor,
    p.mfaActivo ? codigo.contenedor : null,
    h('p', { class: 'campo' }, entiendo, h('label', { for: 'entiendo-eliminar' }, ' Entiendo que no se puede deshacer')),
    boton,
  );
  const envio = controlEnvio(form, boton);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    contrasena.error(null);
    codigo.error(null);
    if (contrasena.valor() === '') {
      contrasena.error('Escribe tu contraseña.');
      contrasena.input.focus();
      return;
    }
    /** @type {{ contrasena: string, codigo?: string }} */
    const cuerpo = { contrasena: contrasena.valor() };
    if (p.mfaActivo) {
      const c = normalizarCodigo(codigo.valor());
      if (!c) {
        codigo.error('El código tiene 6 dígitos.');
        codigo.input.focus();
        return;
      }
      cuerpo.codigo = c;
    }
    if (!entiendo.checked) return envio.error('Marca «Entiendo que no se puede deshacer» para continuar.');
    envio.enviando('Eliminando…');
    void (async () => {
      try {
        /** @type {{ espaciosBorrados: number, documentosBorrados: number }} */
        const r = await api.solicitar('/cuenta', { metodo: 'DELETE', cuerpo });
        contrasena.input.value = '';
        await borrarDatosLocales();
        dejarDespedida(r);
        // Primero se cambia a la vista PÚBLICA y recién entonces se olvida la sesión: así el router no
        // pasa por "entrar" (ni recuerda esta sección como destino) al perder la sesión.
        window.addEventListener('hashchange', () => api.olvidarSesion(), { once: true });
        window.location.hash = '#/cuenta-eliminada';
      } catch (err) {
        envio.listo();
        contrasena.ocultar();
        if (contrasenaIncorrecta(contrasena, err)) return;
        if (err instanceof ErrorApi && err.codigo === 'codigo_mfa_invalido') {
          codigo.error('El código no es válido. Usa el código actual de tu app.');
          codigo.input.focus();
          return;
        }
        if (err instanceof ErrorApi && err.codigo === 'mfa_requerido') {
          // La verificación se activó en otro dispositivo después de abrir esta pantalla.
          p = { ...p, mfaActivo: true };
          contrasena.contenedor.after(codigo.contenedor);
          codigo.error('Tu cuenta tiene la verificación en dos pasos activa: escribe el código de tu app.');
          codigo.input.focus();
          return;
        }
        const bloqueos = bloqueosDeEliminacion(err);
        envio.error(
          err,
          bloqueos.map((b) => `${b.tipo === 'documento' ? 'Documento' : 'Espacio'}: ${b.nombre}`),
        );
      }
    })();
  });
  return form;
}
