// Historial de versiones de un documento (bloque N). Cualquier rol lo ve y compara dos versiones (o una con
// el texto actual); la diferencia por líneas se calcula en un Web Worker. Editor o propietario: además
// guarda una versión ahora y restaura una anterior. Restaurar es un CAMBIO NUEVO: el historial no se
// reescribe (queda una versión "restauración" que apunta a la restaurada).
//
// La diferencia se muestra con texto (+ / − y "Agregada" / "Quitada" para lectores de pantalla) y con
// <ins> / <del>: sin colores nuevos.
import { mensajeParaPersona } from '../../api/errores.js';
import { anunciar } from '../../componentes/anunciar.js';
import { conDatos } from '../../componentes/estado.js';
import { diferenciaEnSegundoPlano } from '../../diff/en-segundo-plano.js';
import { aviso, h } from '../../dom.js';
import { api } from '../../sesion.js';
import { puedeEditar } from './documentos.js';

/**
 * @typedef {{ numero: number, motivo: 'manual' | 'automatica' | 'restauracion', autor: { id: string, nombre: string } | null,
 *   restauradaDe: number | null, creadaEn: string, caracteres: number }} Version
 */

const FECHA = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const MOTIVO = { manual: 'Guardada a mano', automatica: 'Automática', restauracion: 'Restauración' };
/** Líneas iguales que se muestran alrededor de cada cambio; el resto se resume. */
const CONTEXTO = 3;
const ACTUAL = 'actual';

/** @param {Version} v */
const descripcion = (v) =>
  `Versión ${String(v.numero)} · ${MOTIVO[v.motivo]}${v.restauradaDe ? ` de la ${String(v.restauradaDe)}` : ''}${v.autor ? ` · ${v.autor.nombre}` : ''} · ${FECHA.format(new Date(v.creadaEn))}`;

/**
 * La diferencia, con las líneas iguales resumidas lejos de los cambios.
 * @param {import('../../diff/lineas.js').Operacion[]} ops
 */
export function vistaDiferencia(ops) {
  const agregadas = ops.filter((o) => o.tipo === 'agregar').reduce((n, o) => n + o.lineas.length, 0);
  const quitadas = ops.filter((o) => o.tipo === 'quitar').reduce((n, o) => n + o.lineas.length, 0);
  const lineas = (/** @type {number} */ n, /** @type {string} */ que) => `${String(n)} ${n === 1 ? `línea ${que}` : `líneas ${que}s`}`;
  const resumen = h(
    'p',
    { class: 'diferencia-resumen', role: 'status' },
    agregadas + quitadas === 0 ? 'No hay diferencias.' : `${lineas(agregadas, 'agregada')} y ${lineas(quitadas, 'quitada')}.`,
  );
  const lista = h('ol', { class: 'diferencia', 'aria-label': 'Diferencias por línea' });
  const linea = (/** @type {'igual' | 'quitar' | 'agregar'} */ tipo, /** @type {string} */ texto) => {
    const contenido = texto.replace(/\r?\n$/, '');
    if (tipo === 'igual') return h('li', { class: 'linea-igual' }, h('span', { class: 'marca', 'aria-hidden': 'true' }, ' '), contenido || ' ');
    const etiqueta = tipo === 'agregar' ? 'Agregada: ' : 'Quitada: ';
    const marca = tipo === 'agregar' ? '+' : '−';
    return h(
      'li',
      { class: tipo === 'agregar' ? 'linea-agregada' : 'linea-quitada' },
      h('span', { class: 'marca', 'aria-hidden': 'true' }, marca),
      h(tipo === 'agregar' ? 'ins' : 'del', {}, h('span', { class: 'solo-lectores' }, etiqueta), contenido || ' '),
    );
  };
  ops.forEach((op, i) => {
    if (op.tipo !== 'igual') {
      for (const l of op.lineas) lista.append(linea(op.tipo, l));
      return;
    }
    // Iguales: CONTEXTO al principio (si viene después de un cambio) y al final (si viene antes de uno).
    const despuesDeCambio = i > 0;
    const antesDeCambio = i < ops.length - 1;
    const desde = despuesDeCambio ? CONTEXTO : 0;
    const hasta = antesDeCambio ? op.lineas.length - CONTEXTO : op.lineas.length;
    if (agregadas + quitadas === 0 || desde >= hasta) {
      for (const l of op.lineas) lista.append(linea('igual', l));
      return;
    }
    for (const l of op.lineas.slice(0, desde)) lista.append(linea('igual', l));
    lista.append(h('li', { class: 'linea-resumen' }, `… ${String(hasta - desde)} líneas iguales …`));
    for (const l of op.lineas.slice(hasta)) lista.append(linea('igual', l));
  });
  return h('div', {}, resumen, lista);
}

/** @param {Record<string, string>} params */
export async function render(params) {
  const id = params.id ?? '';
  const titulo = h('h1', { tabindex: '-1' }, 'Historial de versiones');
  const pagina = h('section', { class: 'pagina-versiones' }, titulo);
  /** @type {import('./documentos.js').Documento} */
  let d;
  try {
    d = await api.solicitar(`/documentos/${encodeURIComponent(id)}`);
  } catch (err) {
    pagina.append(aviso('error', mensajeParaPersona(err)), h('a', { href: '#/documentos' }, 'Volver a los documentos'));
    return pagina;
  }
  titulo.textContent = `Historial de ${d.titulo}`;
  const base = `/documentos/${encodeURIComponent(d.id)}`;
  const escribe = puedeEditar(d.rol) && api.usuario()?.rol !== 'lector';
  const resultado = h('div', { class: 'resultado' });
  const comparacion = h('div', { class: 'comparacion' });
  const contenedor = h('div', {});

  /** El texto de una versión, o el actual. */
  const textoDe = async (/** @type {string} */ cual) =>
    /** @type {{ texto: string }} */ (await api.solicitar(cual === ACTUAL ? `${base}/texto` : `${base}/versiones/${cual}`)).texto;

  /** @param {Version[]} versiones */
  function mostrar(versiones) {
    if (versiones.length === 0) return h('p', { class: 'vacio' }, 'Todavía no hay versiones de este documento.');
    const opciones = () => [h('option', { value: ACTUAL }, 'Texto actual'), ...versiones.map((v) => h('option', { value: String(v.numero) }, descripcion(v)))];
    const desde = h('select', { id: 'comparar-desde' }, ...opciones());
    const hasta = h('select', { id: 'comparar-hasta' }, ...opciones());
    desde.value = String(versiones[0]?.numero ?? ACTUAL);
    hasta.value = ACTUAL;
    const comparar = h('button', { type: 'submit', class: 'boton' }, 'Comparar');
    const form = h(
      'form',
      { class: 'comparar' },
      h('div', { class: 'campo' }, h('label', { for: 'comparar-desde' }, 'Desde'), desde),
      h('div', { class: 'campo' }, h('label', { for: 'comparar-hasta' }, 'Hasta'), hasta),
      comparar,
    );
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      comparar.disabled = true;
      comparacion.replaceChildren(h('p', { class: 'cargando', role: 'status' }, 'Comparando…'));
      (async () => {
        const [a, b] = await Promise.all([textoDe(desde.value), textoDe(hasta.value)]);
        comparacion.replaceChildren(vistaDiferencia(await diferenciaEnSegundoPlano(a, b)));
      })()
        .catch((err) => comparacion.replaceChildren(aviso('error', `No se pudo comparar. ${mensajeParaPersona(err)}`)))
        .finally(() => {
          comparar.disabled = false;
        });
    });

    const filas = versiones.map((v) => {
      const acciones = h('p', { class: 'acciones' });
      if (escribe) {
        const restaurar = h('button', { type: 'button', class: 'boton boton-chico', 'aria-describedby': `version-${String(v.numero)}` }, 'Restaurar');
        restaurar.addEventListener('click', () => {
          const si = h('button', { type: 'button', class: 'boton boton-chico' }, `Sí, restaurar la ${String(v.numero)}`);
          const no = h('button', { type: 'button', class: 'boton boton-chico' }, 'No');
          const pregunta = h('p', { tabindex: '-1' }, `¿Restaurar la versión ${String(v.numero)}? El documento pasa a ese texto como un cambio nuevo; el historial se conserva.`);
          const confirmar = h('div', { class: 'confirmar' }, pregunta, h('p', { class: 'acciones' }, si, no));
          acciones.replaceWith(confirmar);
          pregunta.focus();
          no.addEventListener('click', () => confirmar.replaceWith(acciones));
          si.addEventListener('click', () => {
            si.disabled = true;
            api.solicitar(`${base}/versiones/${String(v.numero)}/restaurar`, { metodo: 'POST' }).then(
              (/** @type {Version} */ nueva) => {
                const t = `Restauraste la versión ${String(v.numero)}: quedó como la versión ${String(nueva.numero)}.`;
                resultado.replaceChildren(aviso('exito', t));
                anunciar(t);
                cargar();
              },
              (err) => {
                confirmar.replaceWith(acciones);
                resultado.replaceChildren(aviso('error', mensajeParaPersona(err)));
              },
            );
          });
        });
        acciones.append(restaurar);
      }
      return h('li', { class: 'fila' }, h('p', { id: `version-${String(v.numero)}`, class: 'fila-titulo' }, descripcion(v)), h('p', { class: 'suave' }, `${String(v.caracteres)} caracteres`), acciones);
    });
    return h('div', {}, form, comparacion, h('h2', {}, 'Versiones'), h('ol', { class: 'filas', reversed: true }, ...filas));
  }

  function cargar() {
    contenedor.replaceChildren(
      conDatos({
        queCarga: 'el historial',
        cargar: (senal) => api.solicitar(`${base}/versiones`, { senal }).then((/** @type {{ versiones: Version[] }} */ r) => r.versiones),
        mostrar,
      }),
    );
  }

  pagina.append(h('p', { class: 'enlaces-documento' }, h('a', { href: `#${base}` }, 'Volver al documento')), resultado);
  if (escribe) {
    const guardar = h('button', { type: 'button', class: 'boton boton-primario' }, 'Guardar una versión ahora');
    guardar.addEventListener('click', () => {
      guardar.disabled = true;
      api.solicitar(`${base}/versiones`, { metodo: 'POST' }).then(
        (/** @type {Version} */ v) => {
          const t = `Guardaste la versión ${String(v.numero)}.`;
          resultado.replaceChildren(aviso('exito', t));
          anunciar(t);
          guardar.disabled = false;
          cargar();
        },
        (err) => {
          guardar.disabled = false;
          resultado.replaceChildren(aviso('error', mensajeParaPersona(err)));
        },
      );
    });
    pagina.append(h('p', {}, guardar));
  }
  pagina.append(contenedor);
  cargar();
  return pagina;
}
