// Búsqueda por significado en la lista de documentos del espacio (bloque Q). Diferida propia: la lista
// no tiene el renderizador de Markdown ni CodeMirror, y la búsqueda no los necesita (los fragmentos se
// muestran como TEXTO: son contenido del documento, no de la IA).
import { aviso, h } from '../dom.js';
import { api } from '../sesion.js';
import { mensajeIa } from './ia-mensajes.js';

/** Tope del backend para la consulta (MAXIMOS_IA.consulta). */
export const MAXIMO_CONSULTA = 500;
/** Lo que se muestra de cada fragmento. */
const MAXIMO_FRAGMENTO = 300;

/**
 * Busca en un espacio y pinta los resultados en `salida`.
 * @param {{ espacioId: string, consulta: string, salida: HTMLElement }} o
 */
export async function buscarEnEspacio(o) {
  const consulta = o.consulta.trim().slice(0, MAXIMO_CONSULTA);
  if (!consulta) return;
  o.salida.replaceChildren(h('p', { role: 'status' }, 'Buscando…'));
  try {
    const r = /** @type {{ resultados: { documentoId: string, titulo: string, fragmento: number, texto: string, similitud: number }[] }} */ (
      await api.solicitar(`/espacios/${encodeURIComponent(o.espacioId)}/buscar`, { metodo: 'POST', cuerpo: { consulta } })
    );
    if (r.resultados.length === 0) {
      o.salida.replaceChildren(h('p', { role: 'status' }, 'No se encontró nada parecido en este espacio.'));
      return;
    }
    o.salida.replaceChildren(
      h('p', { role: 'status' }, `${String(r.resultados.length)} ${r.resultados.length === 1 ? 'resultado' : 'resultados'} parecidos.`),
      h(
        'ol',
        { class: 'resultados-ia' },
        ...r.resultados.map((x) =>
          h(
            'li',
            {},
            h('a', { href: `#/documentos/${encodeURIComponent(x.documentoId)}` }, x.titulo),
            h('span', { class: 'ayuda' }, ` · parecido: ${String(Math.round(x.similitud * 100))} %`),
            h('p', { class: 'fragmento-ia' }, x.texto.length > MAXIMO_FRAGMENTO ? `${x.texto.slice(0, MAXIMO_FRAGMENTO)}…` : x.texto),
          ),
        ),
      ),
    );
  } catch (e) {
    o.salida.replaceChildren(aviso('error', mensajeIa(e)));
  }
}
