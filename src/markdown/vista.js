// Vista renderizada del Markdown (bloque O; ADR 0004: SIN HTML embebido). Tres pasos, sin innerHTML nunca:
//   1. analizar: el Markdown a un árbol mdast (micromark, CommonMark + tablas, tachado y tareas de GFM),
//      con la POSICIÓN de fuente de cada nodo;
//   2. aVista: el árbol a una "vista" de objetos planos con SOLO elementos y atributos permitidos. El HTML
//      escrito en el Markdown sale como TEXTO literal (quien lo escribió ve que no se interpreta);
//   3. sanear: una segunda pasada, independiente, por LISTA BLANCA: lo que no está en ella se quita (un
//      elemento desconocido deja su texto; un atributo desconocido o un enlace con protocolo no permitido
//      se descartan). Si el paso 2 tuviera un error, este lo frena.
// Después, aDom construye el DOM con createElement y createTextNode.
//
// Cada trozo de texto lleva su posición en el Markdown (data-desde, data-hasta): es la base para anclar
// comentarios desde la vista renderizada.
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmStrikethroughFromMarkdown } from 'mdast-util-gfm-strikethrough';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTaskListItemFromMarkdown } from 'mdast-util-gfm-task-list-item';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';

/**
 * @typedef {{ t: string, desde: number, hasta: number }} Texto  un trozo de texto y su lugar en el Markdown
 * @typedef {{ e: string, a: Record<string, string>, h: Array<Nodo | Texto> }} Nodo
 */

/** Elementos permitidos y los atributos que cada uno puede llevar. Nada más llega al DOM. */
export const PERMITIDOS = /** @type {const} */ ({
  div: ['class'],
  p: [],
  h1: [],
  h2: [],
  h3: [],
  h4: [],
  h5: [],
  h6: [],
  ul: [],
  ol: ['start'],
  li: ['class'],
  input: ['type', 'checked', 'disabled', 'aria-label'],
  blockquote: [],
  pre: [],
  code: ['data-lenguaje', 'data-desde'],
  em: [],
  strong: [],
  del: [],
  a: ['href', 'title', 'rel'],
  hr: [],
  br: [],
  table: [],
  thead: [],
  tbody: [],
  tr: [],
  th: ['scope', 'class'],
  td: ['class'],
  span: ['class', 'data-desde', 'data-hasta'],
});

/** Protocolos de enlace permitidos. Todo lo demás (javascript:, data:, vbscript:, file:...) sale como texto. */
const PROTOCOLOS = ['http:', 'https:', 'mailto:'];
const CLASES = /^(tarea|alinear-(izquierda|centro|derecha)|html-literal|imagen|markdown|hljs-[a-z_-]+( [a-z_-]+)*)$/;
const LENGUAJE = /^[a-z0-9#+-]{1,20}$/i;
const NUMERO = /^\d{1,9}$/;

/** ¿Un enlace seguro? Solo absoluto con un protocolo permitido, o un ancla de la misma página (#algo). */
export function enlaceSeguro(/** @type {string} */ url) {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(url)) return false;
  if (/^#[\w-]{0,100}$/.test(url)) return true;
  try {
    return PROTOCOLOS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Valor permitido de un atributo (o null si se descarta). */
function valorPermitido(/** @type {string} */ e, /** @type {string} */ nombre, /** @type {string} */ valor) {
  const lista = /** @type {Record<string, readonly string[]>} */ (PERMITIDOS)[e];
  if (!lista?.includes(nombre)) return null;
  switch (nombre) {
    case 'href':
      return enlaceSeguro(valor) ? valor : null;
    case 'rel':
      return valor === 'noopener noreferrer nofollow ugc' ? valor : null;
    case 'class':
      return CLASES.test(valor) ? valor : null;
    case 'type':
      return valor === 'checkbox' ? valor : null;
    case 'checked':
    case 'disabled':
      return valor === '' ? valor : null;
    case 'scope':
      return valor === 'col' ? valor : null;
    case 'data-lenguaje':
      return LENGUAJE.test(valor) ? valor : null;
    case 'start':
    case 'data-desde':
    case 'data-hasta':
      return NUMERO.test(valor) ? valor : null;
    case 'title':
    case 'aria-label':
      return valor.slice(0, 300);
    default:
      return null;
  }
}

/** El Markdown a mdast con posiciones. Sin la extensión de HTML: el HTML queda como nodos "html" (texto). */
export function analizar(/** @type {string} */ md) {
  return fromMarkdown(md, {
    extensions: [gfmTable(), gfmStrikethrough(), gfmTaskListItem()],
    mdastExtensions: [gfmTableFromMarkdown(), gfmStrikethroughFromMarkdown(), gfmTaskListItemFromMarkdown()],
  });
}

/**
 * @param {string} e @param {Record<string, string>} [a] @param {Array<Nodo | Texto>} [h]
 * @returns {Nodo}
 */
const nodo = (e, a = {}, h = []) => ({ e, a, h });

/**
 * mdast a vista. `md` es el Markdown original: para ubicar el texto de los nodos de código dentro de su
 * nodo (el valor sin las comillas invertidas o las cercas).
 * @param {import('mdast').Root} raiz @param {string} md
 * @returns {Nodo}
 */
export function aVista(raiz, md) {
  /** Destinos de las referencias ([texto][id] → la definición [id]: url). */
  /** @type {Map<string, { url: string, title: string | null | undefined }>} */
  const definiciones = new Map();
  (function buscar(/** @type {any} */ n) {
    if (n.type === 'definition') definiciones.set(String(n.identifier).toLowerCase(), { url: n.url, title: n.title });
    for (const c of n.children ?? []) buscar(c);
  })(raiz);

  /** Texto con su posición; si el valor no es idéntico a la fuente (escapes, entidades), con los bordes del nodo. */
  const texto = (/** @type {string} */ valor, /** @type {any} */ n) => {
    const desde = n.position?.start?.offset ?? 0;
    const hasta = n.position?.end?.offset ?? desde;
    const fuente = md.slice(desde, hasta);
    const i = fuente.indexOf(valor);
    return i >= 0 && valor !== '' ? { t: valor, desde: desde + i, hasta: desde + i + valor.length } : { t: valor, desde, hasta };
  };

  /** Un enlace (o, si no es seguro, solo su contenido). */
  const enlace = (/** @type {string} */ url, /** @type {string | null | undefined} */ titulo, /** @type {Array<Nodo | Texto>} */ hijos) =>
    enlaceSeguro(url) ? nodo('a', { href: url, rel: 'noopener noreferrer nofollow ugc', ...(titulo ? { title: titulo } : {}) }, hijos) : nodo('span', {}, hijos);

  /** @param {any} n @returns {Array<Nodo | Texto>} */
  function convertir(n) {
    const hijos = () => (n.children ?? []).flatMap(convertir);
    switch (n.type) {
      case 'root':
        return [nodo('div', { class: 'markdown' }, hijos())];
      case 'paragraph':
        return [nodo('p', {}, hijos())];
      case 'heading':
        return [nodo(`h${String(Math.min(Math.max(n.depth, 1), 6))}`, {}, hijos())];
      case 'thematicBreak':
        return [nodo('hr')];
      case 'blockquote':
        return [nodo('blockquote', {}, hijos())];
      case 'list':
        return [nodo(n.ordered ? 'ol' : 'ul', n.ordered && n.start !== null && n.start !== 1 ? { start: String(n.start) } : {}, hijos())];
      case 'listItem': {
        if (typeof n.checked !== 'boolean') return [nodo('li', {}, hijos())];
        const casilla = nodo('input', { type: 'checkbox', disabled: '', ...(n.checked ? { checked: '' } : {}), 'aria-label': n.checked ? 'Tarea hecha' : 'Tarea pendiente' });
        return [nodo('li', { class: 'tarea' }, [casilla, ...hijos()])];
      }
      case 'code': {
        const t = texto(n.value, n);
        /** @type {Record<string, string>} */
        const a = { 'data-desde': String(t.desde) };
        if (typeof n.lang === 'string' && LENGUAJE.test(n.lang)) a['data-lenguaje'] = n.lang;
        return [nodo('pre', {}, [nodo('code', a, [t])])];
      }
      case 'inlineCode':
        return [nodo('code', {}, [texto(n.value, n)])];
      case 'html':
        // HTML escrito en el Markdown: se muestra como texto, nunca como etiquetas (ADR 0004).
        return [nodo('span', { class: 'html-literal' }, [texto(n.value, n)])];
      case 'text':
        return [texto(n.value, n)];
      case 'emphasis':
        return [nodo('em', {}, hijos())];
      case 'strong':
        return [nodo('strong', {}, hijos())];
      case 'delete':
        return [nodo('del', {}, hijos())];
      case 'break':
        return [nodo('br')];
      case 'link':
        return [enlace(n.url, n.title, hijos())];
      case 'linkReference': {
        const d = definiciones.get(String(n.identifier).toLowerCase());
        return d ? [enlace(d.url, d.title, hijos())] : hijos();
      }
      case 'image':
      case 'imageReference': {
        // Las imágenes NO se cargan (un servidor ajeno vería quién lee): se muestran como un enlace a ellas.
        const d = n.type === 'image' ? { url: n.url, title: n.title } : definiciones.get(String(n.identifier).toLowerCase());
        const etiqueta = { t: `Imagen: ${n.alt || 'sin descripción'}`, ...posicionDe(n) };
        return [nodo('span', { class: 'imagen' }, [d ? enlace(d.url, d.title, [etiqueta]) : etiqueta])];
      }
      case 'definition':
        return [];
      case 'table': {
        const alineacion = /** @type {(string | null)[]} */ (n.align ?? []);
        const filas = (n.children ?? []).map((/** @type {any} */ fila, /** @type {number} */ i) =>
          nodo(
            'tr',
            {},
            (fila.children ?? []).map((/** @type {any} */ celda, /** @type {number} */ j) => {
              const al = alineacion[j];
              const clase = al === 'left' ? 'alinear-izquierda' : al === 'center' ? 'alinear-centro' : al === 'right' ? 'alinear-derecha' : null;
              const a = { ...(i === 0 ? { scope: 'col' } : {}), ...(clase ? { class: clase } : {}) };
              return nodo(i === 0 ? 'th' : 'td', a, (celda.children ?? []).flatMap(convertir));
            }),
          ),
        );
        return [nodo('table', {}, [nodo('thead', {}, filas.slice(0, 1)), nodo('tbody', {}, filas.slice(1))])];
      }
      default:
        // Un tipo que no conocemos: su texto, sin elemento.
        return n.children ? hijos() : typeof n.value === 'string' ? [texto(n.value, n)] : [];
    }
  }
  const [vista] = convertir(raiz);
  return /** @type {Nodo} */ (vista);
}

const posicionDe = (/** @type {any} */ n) => ({ desde: n.position?.start?.offset ?? 0, hasta: n.position?.end?.offset ?? 0 });

const esTexto = (/** @type {Nodo | Texto} */ x) => 't' in x;

/**
 * Segunda pasada, por LISTA BLANCA: un elemento no permitido deja solo sus hijos; un atributo no
 * permitido (o con un valor no permitido) se quita. Devuelve un árbol nuevo.
 * @param {Nodo} n
 * @returns {Array<Nodo | Texto>}
 */
export function sanear(n) {
  const hijos = n.h.flatMap((x) => (esTexto(x) ? [/** @type {Texto} */ (x)] : sanear(/** @type {Nodo} */ (x))));
  if (!Object.hasOwn(PERMITIDOS, n.e)) return hijos;
  /** @type {Record<string, string>} */
  const a = {};
  for (const [nombre, valor] of Object.entries(n.a)) {
    const v = valorPermitido(n.e, nombre, String(valor));
    if (v !== null) a[nombre] = v;
  }
  return [{ e: n.e, a, h: hijos }];
}

/**
 * La vista (ya saneada) al DOM. Cada texto va en un <span> con su posición en el Markdown.
 * @param {Array<Nodo | Texto>} nodos @param {Document} [doc]
 * @returns {DocumentFragment}
 */
export function aDom(nodos, doc = document) {
  const fragmento = doc.createDocumentFragment();
  const poner = (/** @type {Node} */ padre, /** @type {Nodo | Texto} */ x) => {
    if (esTexto(x)) {
      const t = /** @type {Texto} */ (x);
      if (padre.nodeName === 'CODE') {
        padre.appendChild(doc.createTextNode(t.t));
        return;
      }
      const s = doc.createElement('span');
      s.setAttribute('data-desde', String(t.desde));
      s.setAttribute('data-hasta', String(t.hasta));
      s.appendChild(doc.createTextNode(t.t));
      padre.appendChild(s);
      return;
    }
    const n = /** @type {Nodo} */ (x);
    const el = doc.createElement(n.e);
    for (const [nombre, valor] of Object.entries(n.a)) el.setAttribute(nombre, valor);
    for (const h of n.h) poner(el, h);
    padre.appendChild(el);
  };
  for (const n of nodos) poner(fragmento, n);
  return fragmento;
}

/** El Markdown, listo para insertar: analizado, convertido, saneado y construido. */
export function renderizar(/** @type {string} */ md, doc = document) {
  return aDom(sanear(aVista(analizar(md), md)), doc);
}
