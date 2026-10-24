// Documentos (bloque L): los espacios de la cuenta con sus documentos. Una cuenta que no es de solo
// lectura crea espacios, y documentos en los espacios donde es propietaria o editora. Los permisos los
// decide el backend: aquí solo se ocultan los botones que darían 403.
import { aviso, h } from '../../dom.js';
import { anunciar } from '../../componentes/anunciar.js';
import { conDatos } from '../../componentes/estado.js';
import { campo, controlEnvio, erroresEnCampos } from '../../componentes/formulario.js';
import { api } from '../../sesion.js';
import { cargarIa } from '../../ia-carga.js';

/**
 * @typedef {{ id: string, nombre: string, rol: 'propietario' | 'editor' | 'lector', miembros: number }} Espacio
 * @typedef {{ id: string, espacioId: string, titulo: string, rol: 'propietario' | 'editor' | 'lector', propietario: { id: string, nombre: string } }} Documento
 */

const ROL_CONTENIDO = { propietario: 'Propietario', editor: 'Edición', lector: 'Lectura' };

/** ¿Puede abrir el editor? El rol efectivo ya viene topado a "lector" para una cuenta lectora. */
export const puedeEditar = (/** @type {Documento['rol']} */ rol) => rol === 'editor' || rol === 'propietario';

/**
 * Formulario de una línea: un campo y un botón; al crear, `alCrear` recibe lo que devolvió el API.
 * @param {{ etiqueta: string, nombre: string, boton: string, enviando: string, maximo: number, enviar: (valor: string) => Promise<unknown>, alCrear: (r: any) => void }} o
 */
function formularioCrear(o) {
  const c = campo({ etiqueta: o.etiqueta, nombre: o.nombre, atributos: { maxlength: String(o.maximo), autocomplete: 'off' } });
  const boton = h('button', { class: 'boton', type: 'submit' }, o.boton);
  const form = h('form', { class: 'crear', novalidate: true }, c.contenedor, boton);
  const control = controlEnvio(form, boton);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    c.error(null);
    const valor = c.valor().trim();
    if (!valor) {
      c.error('Escribe un nombre.');
      c.input.focus();
      return;
    }
    control.enviando(o.enviando);
    o.enviar(valor).then(
      (r) => {
        control.listo();
        c.input.value = '';
        o.alCrear(r);
      },
      (err) => {
        control.listo();
        if (!erroresEnCampos(err, { [o.nombre]: c })) control.error(err);
      },
    );
  });
  return form;
}

/** @param {Documento} d */
function filaDocumento(d) {
  return h(
    'li',
    { class: 'fila' },
    h('div', { class: 'fila-titulo' }, h('a', { href: `#/documentos/${encodeURIComponent(d.id)}` }, d.titulo), h('span', { class: 'insignia' }, ROL_CONTENIDO[d.rol])),
    h('p', { class: 'suave' }, `De ${d.propietario.nombre}`),
    puedeEditar(d.rol) ? h('a', { href: `#/documentos/${encodeURIComponent(d.id)}/editar`, 'aria-label': `Editar ${d.titulo}` }, 'Editar') : null,
  );
}

/**
 * Búsqueda por significado (bloque Q): el formulario es de aquí; buscar carga la IA bajo demanda.
 * @param {Espacio} e
 */
function buscadorIa(e) {
  const id = `buscar-${e.id}`;
  const consulta = h('input', { id, type: 'search', name: 'consulta', maxlength: '500', autocomplete: 'off' });
  const salida = h('div', { class: 'resultados-busqueda' });
  const form = h(
    'form',
    { class: 'buscar-ia', role: 'search', 'aria-label': `Buscar por significado en ${e.nombre}` },
    h('label', { for: id }, h('span', { class: 'etiqueta-ia' }, 'IA'), ' Buscar por significado'),
    ' ',
    consulta,
    ' ',
    h('button', { type: 'submit', class: 'boton boton-chico boton-ia' }, 'Buscar'),
    salida,
  );
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void cargarIa().then((m) => m.buscarEnEspacio({ espacioId: e.id, consulta: consulta.value, salida }));
  });
  return form;
}

/** @param {Espacio} e @param {boolean} cuentaLectora */
function seccionEspacio(e, cuentaLectora) {
  const lista = h('ul', { class: 'filas' });
  const vacio = h('p', { class: 'vacio' }, 'Este espacio todavía no tiene documentos.');
  const titulo = `espacio-${e.id}`;
  const seccion = h('section', { class: 'espacio', 'aria-labelledby': titulo }, h('h2', { id: titulo }, e.nombre), h('p', { class: 'suave' }, `Tu rol: ${ROL_CONTENIDO[e.rol]}`));
  seccion.append(buscadorIa(e));
  seccion.append(
    conDatos({
      queCarga: `los documentos de ${e.nombre}`,
      cargar: (senal) => api.solicitar(`/espacios/${encodeURIComponent(e.id)}/documentos`, { senal }),
      mostrar: (/** @type {{ documentos: Documento[] }} */ r) => {
        lista.replaceChildren(...r.documentos.map(filaDocumento));
        vacio.hidden = r.documentos.length > 0;
        return h('div', {}, vacio, lista);
      },
    }),
  );
  if (!cuentaLectora && puedeEditar(e.rol)) {
    seccion.append(
      formularioCrear({
        etiqueta: `Nuevo documento en ${e.nombre}`,
        nombre: 'titulo',
        boton: 'Crear documento',
        enviando: 'Creando…',
        maximo: 200,
        enviar: (titulo) => api.solicitar(`/espacios/${encodeURIComponent(e.id)}/documentos`, { metodo: 'POST', cuerpo: { titulo } }),
        alCrear: (/** @type {Documento} */ d) => {
          location.hash = `#/documentos/${encodeURIComponent(d.id)}/editar`;
        },
      }),
    );
  }
  return seccion;
}

export function render() {
  const cuentaLectora = api.usuario()?.rol === 'lector';
  const espacios = h('div', { class: 'espacios' });
  const pagina = h('section', {}, h('h1', { tabindex: '-1' }, 'Documentos'), espacios);
  const cargar = () =>
    espacios.replaceChildren(
      conDatos({
        queCarga: 'tus espacios',
        cargar: (senal) => api.solicitar('/espacios', { senal }),
        estaVacio: (/** @type {{ espacios: Espacio[] }} */ r) => r.espacios.length === 0,
        textoVacio: cuentaLectora ? 'Todavía no estás en ningún espacio. Pide que te agreguen a uno.' : 'Todavía no tienes espacios. Crea el primero.',
        mostrar: (/** @type {{ espacios: Espacio[] }} */ r) => h('div', {}, ...r.espacios.map((e) => seccionEspacio(e, cuentaLectora))),
      }),
    );
  cargar();
  if (!cuentaLectora) {
    pagina.append(
      formularioCrear({
        etiqueta: 'Nuevo espacio',
        nombre: 'nombre',
        boton: 'Crear espacio',
        enviando: 'Creando…',
        maximo: 80,
        enviar: (nombre) => api.solicitar('/espacios', { metodo: 'POST', cuerpo: { nombre } }),
        alCrear: (/** @type {Espacio} */ e) => {
          cargar();
          anunciar(`Espacio ${e.nombre} creado.`);
        },
      }),
    );
  } else {
    pagina.append(aviso('info', 'Tu cuenta es de solo lectura: puedes leer los documentos de tus espacios.'));
  }
  return pagina;
}
