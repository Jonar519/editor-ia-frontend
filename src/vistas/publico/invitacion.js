// Completar una invitación: #/invitacion/<token>. El token se borra de la URL ANTES de cualquier
// petición. Una cuenta admin configura además la verificación en dos pasos (secreto + primer código) y
// recibe sus 10 códigos de respaldo, que se muestran UNA sola vez.
//
// Sin QR por ahora: dibujarlo exige una librería o una implementación propia, que no están aprobadas. El
// secreto se escribe a mano o se abre con el enlace otpauth:// (en el teléfono abre la app autenticadora).
import { ErrorApi } from '../../api/errores.js';
import { conDatos } from '../../componentes/estado.js';
import { campo, campoContrasena, controlEnvio, detallesComoLista } from '../../componentes/formulario.js';
import { bloqueSecreto, mostrarCodigos } from '../../componentes/mfa.js';
import { aviso, h } from '../../dom.js';
import { api, tomarDestino } from '../../sesion.js';
import { consumirToken } from '../../token-url.js';
import { normalizarCodigo, problemaContrasenaNueva } from '../../validacion.js';

const ROLES = { admin: 'administración', editor: 'edición', lector: 'lectura' };

/**
 * @typedef {{ nombre: string, correo: string, rol: 'admin' | 'editor' | 'lector', requiereMfa: boolean, expiraEn: string }} Invitacion
 * @typedef {import('../../api/cliente.js').SesionRespuesta & { codigosRespaldo?: string[] }} Completada
 */

/** @param {Record<string, string>} params */
export function render(params) {
  const token = consumirToken(params.token, '#/invitacion');
  const seccion = h('section', {}, h('h1', { tabindex: '-1' }, 'Crear tu cuenta'));
  if (!token) {
    seccion.append(aviso('error', 'Abre el enlace completo del correo de invitación. Si ya lo usaste, entra con tu correo y contraseña.'), h('p', {}, h('a', { href: '#/entrar' }, 'Entrar')));
    return seccion;
  }
  seccion.append(
    conDatos({
      queCarga: 'la invitación',
      cargar: (senal) => /** @type {Promise<Invitacion>} */ (api.solicitar('/invitaciones/consultar', { metodo: 'POST', cuerpo: { token }, sinSesion: true, senal })),
      mostrar: (inv) => formulario(seccion, token, inv),
    }),
  );
  return seccion;
}

/**
 * @param {HTMLElement} seccion
 * @param {string} token
 * @param {Invitacion} inv
 */
function formulario(seccion, token, inv) {
  const nueva = campoContrasena({ etiqueta: 'Contraseña', nombre: 'nueva', autocompletar: 'new-password', ayuda: 'Al menos 12 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.' });
  const repetir = campoContrasena({ etiqueta: 'Repite la contraseña', nombre: 'repetir', autocompletar: 'new-password' });
  const codigo = campo({
    etiqueta: 'Primer código de 6 dígitos',
    nombre: 'codigo',
    autocompletar: 'one-time-code',
    ayuda: 'El que muestra tu app autenticadora después de agregar la cuenta.',
    atributos: { inputmode: 'numeric', maxlength: '7' },
  });
  const zonaMfa = h('div', { class: 'zona-mfa' });
  let secretoListo = false;

  async function prepararMfa() {
    secretoListo = false;
    zonaMfa.replaceChildren(h('p', { class: 'cargando', role: 'status' }, 'Preparando la verificación en dos pasos…'));
    try {
      /** @type {{ secreto: string, uri: string }} */
      const m = await api.solicitar('/invitaciones/mfa', { metodo: 'POST', cuerpo: { token }, sinSesion: true });
      zonaMfa.replaceChildren(
        h('h2', {}, 'Verificación en dos pasos'),
        h('p', {}, 'Las cuentas de administración la usan siempre. Agrega esta cuenta en tu app autenticadora (por ejemplo, la de tu teléfono) con este secreto:'),
        ...bloqueSecreto(m),
        codigo.contenedor,
      );
      secretoListo = true;
    } catch (err) {
      const reintentar = h('button', { class: 'boton', type: 'button' }, 'Reintentar');
      reintentar.addEventListener('click', () => void prepararMfa());
      zonaMfa.replaceChildren(aviso('error', `No se pudo preparar la verificación en dos pasos. ${err instanceof ErrorApi ? err.message : ''}`), reintentar);
    }
  }

  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Crear la cuenta');
  const form = h('form', { class: 'tarjeta', novalidate: true }, nueva.contenedor, repetir.contenedor, inv.requiereMfa ? zonaMfa : null, boton);
  const envio = controlEnvio(form, boton);
  if (inv.requiereMfa) void prepararMfa();

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    for (const c of [nueva, repetir, codigo]) c.error(null);
    const p = problemaContrasenaNueva(nueva.valor(), repetir.valor());
    if (p) {
      const c = p.campo === 'nueva' ? nueva : repetir;
      c.error(p.mensaje);
      c.input.focus();
      return;
    }
    /** @type {{ token: string, contrasena: string, codigoTotp?: string }} */
    const cuerpo = { token, contrasena: nueva.valor() };
    if (inv.requiereMfa) {
      if (!secretoListo) return envio.error('Primero hay que preparar la verificación en dos pasos.');
      const c = normalizarCodigo(codigo.valor());
      if (!c) {
        codigo.error('El código tiene 6 dígitos.');
        codigo.input.focus();
        return;
      }
      cuerpo.codigoTotp = c;
    }
    envio.enviando('Creando la cuenta…');
    void (async () => {
      try {
        /** @type {Completada} */
        const r = await api.solicitar('/invitaciones/completar', { metodo: 'POST', cuerpo, sinSesion: true });
        nueva.ocultar();
        repetir.ocultar();
        api.establecerSesion(r);
        const irAlDestino = () => {
          window.location.hash = `#${tomarDestino()}`;
        };
        if (r.codigosRespaldo?.length) mostrarCodigos(seccion, r.codigosRespaldo, { alContinuar: irAlDestino });
        else irAlDestino();
      } catch (err) {
        envio.listo();
        nueva.ocultar();
        repetir.ocultar();
        if (err instanceof ErrorApi && err.codigo === 'codigo_mfa_invalido') {
          codigo.error('El código no es válido. Revisa que la hora del teléfono esté bien y usa el código actual.');
          codigo.input.focus();
          return;
        }
        if (err instanceof ErrorApi && err.codigo === 'mfa_reiniciar') {
          envio.error(err);
          void prepararMfa(); // la inscripción se borró: secreto nuevo
          return;
        }
        envio.error(err, detallesComoLista(err));
      }
    })();
  });

  return h(
    'div',
    {},
    h('p', {}, `Hola, ${inv.nombre}. Te invitaron con permisos de ${ROLES[inv.rol]}.`),
    h('dl', { class: 'datos' }, h('dt', {}, 'Correo'), h('dd', {}, inv.correo)),
    form,
  );
}
