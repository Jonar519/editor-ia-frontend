// Un `document` mínimo para probar componentes en Node (sin navegador ni dependencias nuevas): elementos
// con atributos, hijos, eventos y las propiedades que reflejan atributos (hidden). innerHTML LANZA: ningún
// componente debe usarlo (la salida de la IA, en particular, va solo por el saneador).

class Nodo {
  constructor(/** @type {string} */ nombre) {
    this.nodeName = nombre;
    /** @type {Elemento | null} */
    this.parentNode = null;
  }
}

class Texto extends Nodo {
  constructor(/** @type {string} */ t) {
    super('#text');
    this.data = t;
  }
  get textContent() {
    return this.data;
  }
}

export class Elemento extends Nodo {
  constructor(/** @type {string} */ etiqueta) {
    super(etiqueta.toUpperCase());
    /** @type {Map<string, string>} */
    this.atributos = new Map();
    /** @type {Nodo[]} */
    this.childNodes = [];
    /** @type {Map<string, ((ev: any) => void)[]>} */
    this.oyentes = new Map();
    this.disabled = false;
    /** @type {boolean | undefined} */
    this._marcado = undefined;
    /** @type {string | undefined} */
    this._valor = undefined;
  }
  /** Como en el navegador: sin tocarlo, refleja el atributo checked. */
  get checked() {
    return this._marcado ?? this.atributos.has('checked');
  }
  set checked(si) {
    this._marcado = si;
  }
  setAttribute(/** @type {string} */ n, /** @type {string} */ v) {
    this.atributos.set(n, String(v));
  }
  getAttribute(/** @type {string} */ n) {
    return this.atributos.get(n) ?? null;
  }
  hasAttribute(/** @type {string} */ n) {
    return this.atributos.has(n);
  }
  removeAttribute(/** @type {string} */ n) {
    this.atributos.delete(n);
  }
  get id() {
    return this.getAttribute('id') ?? '';
  }
  set id(v) {
    this.setAttribute('id', v);
  }
  get hidden() {
    return this.atributos.has('hidden');
  }
  set hidden(si) {
    if (si) this.atributos.set('hidden', '');
    else this.atributos.delete('hidden');
  }
  /** @returns {string} */
  get value() {
    if (this._valor !== undefined) return this._valor;
    if (this.nodeName === 'SELECT') return this.querySelector('option')?.getAttribute('value') ?? '';
    return this.getAttribute('value') ?? '';
  }
  set value(v) {
    this._valor = v;
  }
  get children() {
    return /** @type {Elemento[]} */ (this.childNodes.filter((n) => n instanceof Elemento));
  }
  /** @param {...(Nodo | string)} hijos */
  append(...hijos) {
    for (const x of hijos) {
      const n = typeof x === 'string' ? new Texto(x) : x;
      if (n.nodeName === '#document-fragment') {
        this.append(.../** @type {Elemento} */ (n).childNodes);
        /** @type {Elemento} */ (n).childNodes = [];
        continue;
      }
      if (n.parentNode) n.parentNode.childNodes = n.parentNode.childNodes.filter((c) => c !== n);
      n.parentNode = this;
      this.childNodes.push(n);
    }
  }
  appendChild(/** @type {Nodo} */ n) {
    this.append(n);
    return n;
  }
  /** @param {...(Nodo | string)} hijos */
  replaceChildren(...hijos) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    this.append(...hijos);
  }
  get textContent() {
    return this.childNodes.map((c) => /** @type {any} */ (c).textContent).join('');
  }
  set textContent(t) {
    this.replaceChildren(...(t ? [String(t)] : []));
  }
  get innerHTML() {
    throw new Error('innerHTML no está permitido');
  }
  set innerHTML(_v) {
    throw new Error('innerHTML no está permitido');
  }
  get isConnected() {
    /** @type {Elemento | null} */
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === documentoActual?.body;
  }
  addEventListener(/** @type {string} */ tipo, /** @type {(ev: any) => void} */ f) {
    this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), f]);
  }
  removeEventListener(/** @type {string} */ tipo, /** @type {(ev: any) => void} */ f) {
    this.oyentes.set(tipo, (this.oyentes.get(tipo) ?? []).filter((x) => x !== f));
  }
  /** Dispara un evento que sube por los padres (como click y keydown). */
  disparar(/** @type {string} */ tipo, /** @type {Record<string, unknown>} */ datos = {}) {
    const ev = {
      type: tipo,
      target: this,
      defaultPrevented: false,
      preventDefault() {
        ev.defaultPrevented = true;
      },
      ...datos,
    };
    /** @type {Elemento | null} */
    let n = this;
    while (n) {
      for (const f of n.oyentes.get(tipo) ?? []) f(ev);
      n = n.parentNode;
    }
    return ev;
  }
  click() {
    if (!this.disabled) this.disparar('click');
  }
  focus() {
    if (documentoActual) documentoActual.activeElement = this;
  }
  /** Todos los descendientes elementos, en orden. */
  todos() {
    /** @type {Elemento[]} */
    const r = [];
    for (const c of this.children) r.push(c, ...c.todos());
    return r;
  }
  /** Selectores simples: "etiqueta", "#id", ".clase". */
  querySelectorAll(/** @type {string} */ sel) {
    const ok = (/** @type {Elemento} */ e) =>
      sel.startsWith('#') ? e.id === sel.slice(1) : sel.startsWith('.') ? (e.getAttribute('class') ?? '').split(/\s+/).includes(sel.slice(1)) : e.nodeName === sel.toUpperCase();
    return this.todos().filter(ok);
  }
  /** @returns {Elemento | null} */
  querySelector(/** @type {string} */ sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

/** @type {{ body: Elemento, activeElement: Elemento | null } | null} */
let documentoActual = null;

/**
 * Instala el document falso en globalThis. Devuelve la región de anuncios (#anuncios) con la lista de lo
 * anunciado, y `quitar()` para dejar globalThis como estaba.
 */
export function instalarDom() {
  const body = new Elemento('body');
  const anuncios = new Elemento('div');
  anuncios.id = 'anuncios';
  body.append(anuncios);
  /** @type {string[]} */
  const anunciado = [];
  Object.defineProperty(anuncios, 'textContent', {
    get: () => anunciado.at(-1) ?? '',
    set: (t) => {
      if (t) anunciado.push(String(t));
    },
  });
  const doc = {
    body,
    /** @type {Elemento | null} */
    activeElement: null,
    createElement: (/** @type {string} */ e) => new Elemento(e),
    createTextNode: (/** @type {string} */ t) => new Texto(t),
    createDocumentFragment: () => new Elemento('#document-fragment'),
    getElementById: (/** @type {string} */ id) => body.querySelector(`#${id}`),
  };
  documentoActual = doc;
  /** @type {any} */ (globalThis).document = doc;
  return {
    body,
    anunciado,
    quitar() {
      documentoActual = null;
      delete (/** @type {any} */ (globalThis).document);
    },
  };
}

/** El botón (o cualquier elemento) cuyo texto es exactamente `texto`. */
export function porTexto(/** @type {Elemento} */ raiz, /** @type {string} */ texto, etiqueta = 'button') {
  const e = raiz.querySelectorAll(etiqueta).find((x) => x.textContent.trim() === texto);
  if (!e) throw new Error(`no hay ${etiqueta} con el texto "${texto}"`);
  return e;
}

/** ¿Se ve? (ni él ni ningún ancestro tiene hidden) */
export function visible(/** @type {Elemento} */ e) {
  /** @type {Elemento | null} */
  let n = e;
  while (n) {
    if (n.hidden) return false;
    n = n.parentNode;
  }
  return true;
}
