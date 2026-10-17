// Administración → Invitaciones: invitar a una persona (nombre, correo, rol), la lista paginada de las
// pendientes (vencidas incluidas: se pueden reenviar), reenviar y cancelar. El enlace de invitación
// NUNCA llega aquí: solo lo recibe la persona invitada en su correo.
//
// Cancelar pide una confirmación en la misma fila (sin ventana modal): el foco va a la pregunta y
// "No" lo devuelve al botón.
import { ErrorApi, mensajeParaPersona } from '../../api/errores.js';
import { anunciar } from '../../componentes/anunciar.js';
import { conDatos } from '../../componentes/estado.js';
import { campo, campoSeleccion, controlEnvio, erroresEnCampos } from '../../componentes/formulario.js';
import { aviso, h } from '../../dom.js';
import { NOMBRE_MAXIMO, pagina, problemaNombre } from '../../reglas-cuenta.js';
import { api } from '../../sesion.js';
import { fechaHora, resultado, ROLES } from '../lector/comun.js';

/**
 * @typedef {'admin' | 'editor' | 'lector'} Rol
 * @typedef {{ usuarioId: string, nombre: string, correo: string, rol: Rol, expiraEn: string, vencida: boolean }} Pendiente
 * @typedef {{ usuario: { id: string, nombre: string, correo: string, rol: Rol }, expiraEn: string, correoEnviado: boolean }} Enviada
 */

/** Invitaciones por página. */
export const POR_PAGINA = 20;

export function render() {
  const lugarLista = h('div', {});
  /** @param {number} desde @param {string} [mensaje] */
  const cargarLista = (desde, mensaje) => {
    lugarLista.replaceChildren(
      conDatos({
        queCarga: 'las invitaciones',
        cargar: (senal) =>
          /** @type {Promise<{ total: number, invitaciones: Pendiente[] }>} */ (api.solicitar(`/admin/invitaciones?limite=${String(POR_PAGINA)}&desde=${String(desde)}`, { senal })),
        estaVacio: (r) => r.total === 0,
        textoVacio: 'No hay invitaciones pendientes.',
        mostrar: (r) => lista(r, desde, cargarLista, mensaje),
      }),
    );
  };
  cargarLista(0);
  return h(
    'section',
    {},
    h('h1', { tabindex: '-1' }, 'Administración'),
    formularioInvitar(() => cargarLista(0)),
    h('h2', { id: 'titulo-pendientes', tabindex: '-1' }, 'Invitaciones pendientes'),
    lugarLista,
  );
}

/** Texto del resultado de invitar o reenviar. @param {Enviada} r @param {'invitar' | 'reenviar'} accion */
export function textoEnviada(r, accion) {
  const quien = `${r.usuario.nombre} (${r.usuario.correo})`;
  if (!r.correoEnviado) return `La invitación de ${quien} está lista, pero el correo no se pudo enviar. Usa «Reenviar» en la lista.`;
  return accion === 'invitar' ? `Invitamos a ${quien}.` : `Reenviamos la invitación a ${quien}.`;
}

/** @param {() => void} alInvitar */
function formularioInvitar(alInvitar) {
  const nombre = campo({ etiqueta: 'Nombre', nombre: 'nombre', autocompletar: 'off', atributos: { maxlength: String(NOMBRE_MAXIMO) } });
  const correo = campo({ etiqueta: 'Correo', nombre: 'correo', tipo: 'email', autocompletar: 'off', atributos: { maxlength: '254', spellcheck: 'false', autocapitalize: 'off' } });
  const rol = campoSeleccion({
    etiqueta: 'Permisos',
    nombre: 'rol',
    opciones: [
      ['lector', 'Lectura: ve los documentos'],
      ['editor', 'Edición: además escribe y edita'],
      ['admin', 'Administración: además invita y administra'],
    ],
    ayuda: 'Una cuenta de administración tendrá que configurar la verificación en dos pasos al crear la cuenta.',
  });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Enviar la invitación');
  const salida = h('div', {});
  const form = h(
    'form',
    { class: 'tarjeta', novalidate: true, 'aria-labelledby': 'titulo-invitar' },
    h('h2', { id: 'titulo-invitar' }, 'Invitar a una persona'),
    h('p', { class: 'ayuda' }, 'Le llega un enlace por correo para crear su cuenta.'),
    nombre.contenedor,
    correo.contenedor,
    rol.contenedor,
    boton,
    salida,
  );
  const envio = controlEnvio(form, boton);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    nombre.error(null);
    correo.error(null);
    salida.replaceChildren();
    const problema = problemaNombre(nombre.valor());
    if (problema) {
      nombre.error(problema);
      nombre.input.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+$/.test(correo.valor().trim())) {
      correo.error('Escribe una dirección de correo completa, por ejemplo nombre@example.com.');
      correo.input.focus();
      return;
    }
    envio.enviando('Enviando…');
    void (async () => {
      try {
        /** @type {Enviada} */
        const r = await api.solicitar('/admin/invitaciones', { metodo: 'POST', cuerpo: { nombre: nombre.valor().trim(), correo: correo.valor().trim(), rol: rol.valor() } });
        envio.listo();
        nombre.input.value = '';
        correo.input.value = '';
        resultado(salida, r.correoEnviado ? 'exito' : 'advertencia', textoEnviada(r, 'invitar'));
        alInvitar();
      } catch (err) {
        envio.listo();
        if (err instanceof ErrorApi && err.codigo === 'correo_en_uso') {
          correo.error('Ya hay una cuenta o una invitación con ese correo.');
          correo.input.focus();
          return;
        }
        if (!erroresEnCampos(err, { nombre, correo })) envio.error(err);
      }
    })();
  });
  return form;
}

/**
 * @param {{ total: number, invitaciones: Pendiente[] }} r
 * @param {number} desde
 * @param {(desde: number, mensaje?: string) => void} cargarLista
 * @param {string} [mensaje]
 */
function lista(r, desde, cargarLista, mensaje) {
  const pag = pagina({ total: r.total, limite: POR_PAGINA, desde });
  const salida = h('div', {}, mensaje ? aviso('exito', mensaje) : null);
  if (mensaje) {
    anunciar(mensaje);
    // La fila (y su botón con el foco) ya no existe: el foco vuelve al título de la lista.
    queueMicrotask(() => document.getElementById('titulo-pendientes')?.focus());
  }

  const items = r.invitaciones.map((inv) => fila(inv, salida, () => cargarLista(desde, undefined), (texto) => cargarLista(r.invitaciones.length === 1 && pag.anterior !== null ? pag.anterior : desde, texto)));

  /** @param {string} texto @param {number | null} destino */
  const botonPagina = (texto, destino) => {
    if (destino === null) return null;
    const b = h('button', { class: 'boton boton-chico', type: 'button' }, texto);
    b.addEventListener('click', () => cargarLista(destino));
    return b;
  };
  return h(
    'div',
    {},
    salida,
    h('p', { class: 'suave' }, `${String(pag.primero)} a ${String(pag.ultimo)} de ${String(r.total)}`),
    h('ul', { class: 'filas', 'aria-labelledby': 'titulo-pendientes' }, ...items),
    h('nav', { class: 'acciones', 'aria-label': 'Páginas de invitaciones' }, botonPagina('Anteriores', pag.anterior), botonPagina('Siguientes', pag.siguiente)),
  );
}

/**
 * @param {Pendiente} inv
 * @param {HTMLElement} salida  donde van los errores de la lista
 * @param {() => void} recargar
 * @param {(texto: string) => void} alCancelar
 */
function fila(inv, salida, recargar, alCancelar) {
  const idTitulo = `invitacion-${inv.usuarioId}`;
  const vence = h('dd', {}, inv.vencida ? 'Venció: hay que reenviarla' : fechaHora(inv.expiraEn));
  const estado = h('div', {});
  const reenviar = h('button', { class: 'boton boton-chico', type: 'button', 'aria-describedby': idTitulo }, 'Reenviar');
  const cancelar = h('button', { class: 'boton boton-chico boton-peligro', type: 'button', 'aria-describedby': idTitulo }, 'Cancelar la invitación');
  const acciones = h('p', { class: 'acciones' }, reenviar, cancelar);

  reenviar.addEventListener('click', () => {
    reenviar.disabled = true;
    estado.replaceChildren();
    api.solicitar(`/admin/invitaciones/${encodeURIComponent(inv.usuarioId)}/reenviar`, { metodo: 'POST' }).then(
      (/** @type {Enviada} */ r) => {
        reenviar.disabled = false;
        vence.replaceChildren(fechaHora(r.expiraEn));
        resultado(estado, r.correoEnviado ? 'exito' : 'advertencia', textoEnviada(r, 'reenviar'));
      },
      (/** @type {unknown} */ err) => {
        reenviar.disabled = false;
        if (err instanceof ErrorApi && err.codigo === 'invitacion_no_encontrada') return recargar();
        estado.replaceChildren(aviso('error', mensajeParaPersona(err)));
      },
    );
  });

  cancelar.addEventListener('click', () => {
    const pregunta = h('p', { tabindex: '-1' }, `¿Cancelar la invitación de ${inv.nombre}? El enlace que recibió dejará de servir.`);
    const si = h('button', { class: 'boton boton-chico boton-peligro', type: 'button' }, 'Sí, cancelarla');
    const no = h('button', { class: 'boton boton-chico', type: 'button' }, 'No');
    const confirmar = h('div', { class: 'confirmar' }, pregunta, h('p', { class: 'acciones' }, si, no));
    acciones.replaceWith(confirmar);
    pregunta.focus();
    no.addEventListener('click', () => {
      confirmar.replaceWith(acciones);
      cancelar.focus();
    });
    si.addEventListener('click', () => {
      si.disabled = true;
      no.disabled = true;
      api.solicitar(`/admin/invitaciones/${encodeURIComponent(inv.usuarioId)}`, { metodo: 'DELETE' }).then(
        () => alCancelar(`Cancelamos la invitación de ${inv.nombre}.`),
        (/** @type {unknown} */ err) => {
          if (err instanceof ErrorApi && err.codigo === 'invitacion_no_encontrada') return alCancelar(`La invitación de ${inv.nombre} ya no estaba pendiente.`);
          confirmar.replaceWith(acciones);
          salida.replaceChildren(aviso('error', mensajeParaPersona(err)));
          cancelar.focus();
        },
      );
    });
  });

  return h(
    'li',
    { class: 'fila' },
    h('p', { class: 'fila-titulo', id: idTitulo }, inv.nombre),
    h('dl', { class: 'datos' }, h('dt', {}, 'Correo'), h('dd', {}, inv.correo), h('dt', {}, 'Permisos'), h('dd', {}, ROLES[inv.rol]), h('dt', {}, 'Vence'), vence),
    estado,
    acciones,
  );
}
