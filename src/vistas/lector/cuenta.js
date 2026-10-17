// Tu cuenta → Perfil: lo que se ve de la cuenta y el formulario de nombre y teléfono. El correo y la
// foto tienen su propia pantalla (enlaces desde aquí y en la navegación de la cuenta).
import { conDatos } from '../../componentes/estado.js';
import { campo, controlEnvio, erroresEnCampos } from '../../componentes/formulario.js';
import { aviso, h } from '../../dom.js';
import { normalizarTelefono, NOMBRE_MAXIMO, problemaNombre } from '../../reglas-cuenta.js';
import { api } from '../../sesion.js';
import { cargarPerfil, fechaHora, lugarAvatar, paginaCuenta, resultado, ROLES } from './comun.js';

/** @typedef {import('./comun.js').Perfil} Perfil */

export function render() {
  return paginaCuenta('/cuenta', 'Tu cuenta', conDatos({ queCarga: 'tu perfil', cargar: cargarPerfil, mostrar: perfil }));
}

/** @param {Perfil} p */
function perfil(p) {
  const pendiente = p.cambioCorreoPendiente;
  return h(
    'div',
    {},
    h(
      'dl',
      { class: 'datos' },
      h('dt', {}, 'Foto'),
      h('dd', {}, lugarAvatar(p), h('a', { href: '#/cuenta/foto' }, p.avatar ? 'Cambiar la foto' : 'Agregar una foto')),
      h('dt', {}, 'Correo'),
      h('dd', {}, `${p.correo} `, h('a', { href: '#/cuenta/correo' }, 'Cambiar el correo')),
      h('dt', {}, 'Permisos'),
      h('dd', {}, ROLES[p.rol]),
      h('dt', {}, 'Verificación en dos pasos'),
      h('dd', {}, p.mfaActivo ? 'Activa ' : 'No activa ', h('a', { href: '#/cuenta/dos-pasos' }, p.mfaActivo ? 'Administrar' : 'Activar')),
      h('dt', {}, 'Cuenta creada'),
      h('dd', {}, fechaHora(p.creadaEn)),
    ),
    pendiente
      ? h('div', { class: 'aviso aviso-info' }, h('span', { class: 'aviso-etiqueta' }, 'Información:'), ` Hay un cambio de correo pendiente a ${pendiente.correoNuevo}. Abre el enlace que llegó a esa dirección antes del `, fechaHora(pendiente.expiraEn), '.')
      : null,
    formulario(p),
  );
}

/** @param {Perfil} p */
function formulario(p) {
  const nombre = campo({ etiqueta: 'Nombre', nombre: 'nombre', autocompletar: 'name', atributos: { maxlength: String(NOMBRE_MAXIMO), value: p.nombre } });
  const telefono = campo({
    etiqueta: 'Teléfono (opcional)',
    nombre: 'telefono',
    tipo: 'tel',
    autocompletar: 'tel',
    requerido: false,
    ayuda: 'En formato internacional, con + y el código del país: +52 55 1234 5678. Déjalo vacío para quitarlo.',
    atributos: { value: p.telefono ?? undefined },
  });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Guardar los cambios');
  const salida = h('div', {});
  const form = h('form', { class: 'tarjeta', novalidate: true, 'aria-labelledby': 'titulo-datos' }, h('h2', { id: 'titulo-datos' }, 'Tus datos de contacto'), nombre.contenedor, telefono.contenedor, boton, salida);
  const envio = controlEnvio(form, boton);
  let actual = { nombre: p.nombre, telefono: p.telefono };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    nombre.error(null);
    telefono.error(null);
    salida.replaceChildren();
    const problema = problemaNombre(nombre.valor());
    if (problema) {
      nombre.error(problema);
      nombre.input.focus();
      return;
    }
    const tel = normalizarTelefono(telefono.valor());
    if ('problema' in tel) {
      telefono.error(tel.problema);
      telefono.input.focus();
      return;
    }
    /** @type {{ nombre?: string, telefono?: string | null }} */
    const cambios = {};
    if (nombre.valor().trim() !== actual.nombre) cambios.nombre = nombre.valor().trim();
    if (tel.valor !== actual.telefono) cambios.telefono = tel.valor;
    if (Object.keys(cambios).length === 0) {
      salida.replaceChildren(aviso('info', 'No hay cambios que guardar.'));
      return;
    }
    envio.enviando('Guardando…');
    void (async () => {
      try {
        /** @type {Perfil} */
        const nuevo = await api.solicitar('/cuenta', { metodo: 'PATCH', cuerpo: cambios });
        actual = { nombre: nuevo.nombre, telefono: nuevo.telefono };
        nombre.input.value = nuevo.nombre;
        telefono.input.value = nuevo.telefono ?? '';
        envio.listo();
        resultado(salida, 'exito', 'Guardamos tus cambios.');
      } catch (err) {
        envio.listo();
        if (!erroresEnCampos(err, { nombre, telefono })) envio.error(err);
      }
    })();
  });
  return form;
}
