// Batería XSS de la vista renderizada (bloque O; ADR 0004): HTML escrito en el Markdown, enlaces con
// protocolos peligrosos (también ofuscados), imágenes, referencias, autoenlaces y lenguajes de código
// manipulados. Se prueba el resultado de las DOS capas (aVista y sanear) y, aparte, que sanear frena un
// árbol malicioso aunque la primera capa fallara. En el navegador, la E2E lo repite sobre el DOM real.
import { describe, expect, it } from 'vitest';
import { PERMITIDOS, aVista, analizar, enlaceSeguro, sanear } from '../../src/markdown/vista.js';

/** @typedef {import('../../src/markdown/vista.js').Nodo} Nodo */
/** @typedef {import('../../src/markdown/vista.js').Texto} Texto */

const vista = (/** @type {string} */ md) => sanear(aVista(analizar(md), md));

/** Todos los elementos y textos del árbol. */
function recorrer(/** @type {Array<Nodo | Texto>} */ nodos, /** @type {Nodo[]} */ elementos = [], /** @type {string[]} */ textos = []) {
  for (const x of nodos) {
    if ('t' in x) textos.push(x.t);
    else {
      elementos.push(x);
      recorrer(x.h, elementos, textos);
    }
  }
  return { elementos, textos: textos.join('') };
}

/** El árbol cumple la lista blanca: elementos, atributos, sin on*, y enlaces seguros. */
function cumpleListaBlanca(/** @type {Array<Nodo | Texto>} */ nodos) {
  const { elementos } = recorrer(nodos);
  for (const el of elementos) {
    expect(Object.keys(PERMITIDOS), el.e).toContain(el.e);
    for (const [nombre, valor] of Object.entries(el.a)) {
      expect(/** @type {Record<string, readonly string[]>} */ (PERMITIDOS)[el.e], `${el.e}[${nombre}]`).toContain(nombre);
      expect(nombre).not.toMatch(/^on/i);
      if (nombre === 'href') expect(valor).toMatch(/^(https?:|mailto:|#)/i);
    }
  }
}

const CARGAS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)><circle r=1></svg>',
  '<iframe src="https://example.com"></iframe>',
  '<a href="javascript:alert(1)">clic</a>',
  '<style>body{display:none}</style>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<details open ontoggle=alert(1)>',
  'texto <b onmouseover=alert(1)>en línea</b> y más',
  '[x](javascript:alert(1))',
  '[x](JaVaScRiPt:alert(1))',
  '[x](java&#x73;cript:alert(1))',
  '[x](javascript&#58;alert(1))',
  '[x](%6Aavascript:alert(1))',
  '[x](<javascript:alert(1)>)',
  '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[x](vbscript:msgbox(1))',
  '[x](file:///etc/passwd)',
  '<javascript:alert(1)>',
  '[x][a]\n\n[a]: javascript:alert(1)',
  '![x](javascript:alert(1))',
  '![rastreo](https://example.com/pixel.png)',
  '![x][b]\n\n[b]: data:image/svg+xml,<svg onload=alert(1)>',
  '```js" onmouseover="alert(1)\ncódigo\n```',
  '| a | <script>x</script> |\n|---|---|\n| <img src=x onerror=alert(1)> | b |',
  '[x](https://example.com "t\\" onmouseover=\\"alert(1)")',
];

describe('batería XSS de la vista renderizada', () => {
  it.each(CARGAS)('%s', (carga) => {
    const v = vista(carga);
    cumpleListaBlanca(v);
    const { elementos } = recorrer(v);
    // Nunca un elemento que ejecute, cargue o incruste algo.
    expect(elementos.map((e) => e.e)).not.toEqual(expect.arrayContaining(['script', 'img', 'iframe', 'svg', 'style', 'math', 'object', 'embed']));
  });

  it('el HTML escrito se ve como texto literal (no se borra en silencio)', () => {
    const { textos } = recorrer(vista('Hola <script>alert(1)</script> mundo'));
    expect(textos).toContain('<script>alert(1)</script>');
  });

  it('las imágenes no se cargan: quedan como enlace (si el destino es seguro) con su descripción', () => {
    const { elementos, textos } = recorrer(vista('![logo](https://example.com/logo.png)'));
    expect(elementos.find((e) => e.e === 'a')?.a.href).toBe('https://example.com/logo.png');
    expect(textos).toBe('Imagen: logo');
  });

  it('sanear frena un árbol malicioso aunque la primera capa fallara', () => {
    /** @type {Nodo} */
    const malicioso = {
      e: 'div',
      a: { class: 'markdown', onclick: 'alert(1)', style: 'x' },
      h: [
        { e: 'script', a: {}, h: [{ t: 'alert(1)', desde: 0, hasta: 8 }] },
        { e: 'a', a: { href: 'javascript:alert(1)', rel: 'noopener noreferrer nofollow ugc', onmouseover: 'x' }, h: [{ t: 'clic', desde: 0, hasta: 4 }] },
        { e: 'img', a: { src: 'x', onerror: 'alert(1)' }, h: [] },
        { e: 'span', a: { class: 'hljs-x" onclick="y', 'data-desde': '1e9' }, h: [] },
        { e: 'code', a: { 'data-lenguaje': 'js" onmouseover="x' }, h: [] },
      ],
    };
    const v = sanear(malicioso);
    cumpleListaBlanca(v);
    const { elementos, textos } = recorrer(v);
    expect(elementos.map((e) => e.e)).toEqual(['div', 'a', 'span', 'code']);
    expect(elementos.find((e) => e.e === 'a')?.a).toEqual({ rel: 'noopener noreferrer nofollow ugc' });
    expect(textos).toBe('alert(1)clic'); // el texto del <script> queda como texto, sin el elemento
  });

  it('enlaces: solo http, https, mailto o un ancla de la página', () => {
    for (const ok of ['https://example.com/a?b=1#c', 'http://example.com', 'mailto:ana@example.com', '#seccion']) expect(enlaceSeguro(ok), ok).toBe(true);
    for (const mal of ['javascript:alert(1)', ' https://example.com', 'https://exa\nmple.com', '/ruta', '//example.com', 'ftp://example.com', '#a b']) expect(enlaceSeguro(mal), mal).toBe(false);
  });
});

describe('vista renderizada: estructura y posiciones', () => {
  it('títulos, listas, tareas, tablas con alineación, código con lenguaje y tachado', () => {
    const md = '# Guía\n\n- [x] hecho\n- [ ] pendiente\n\n| a | b |\n|:-:|--:|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n~~viejo~~';
    const { elementos } = recorrer(vista(md));
    const de = (/** @type {string} */ e) => elementos.filter((x) => x.e === e);
    expect(de('h1')).toHaveLength(1);
    expect(de('input').map((x) => x.a)).toEqual([
      { type: 'checkbox', disabled: '', checked: '', 'aria-label': 'Tarea hecha' },
      { type: 'checkbox', disabled: '', 'aria-label': 'Tarea pendiente' },
    ]);
    expect(de('th').map((x) => x.a)).toEqual([{ scope: 'col', class: 'alinear-centro' }, { scope: 'col', class: 'alinear-derecha' }]);
    expect(de('code')[0]?.a['data-lenguaje']).toBe('js');
    expect(de('del')).toHaveLength(1);
  });

  it('cada texto sabe dónde está en el Markdown (base para anclar comentarios)', () => {
    const md = 'Hola **mundo** y `código`';
    const textos = [];
    (function juntar(/** @type {Array<Nodo | Texto>} */ ns) {
      for (const x of ns) 't' in x ? textos.push(x) : juntar(x.h);
    })(vista(md));
    for (const t of textos) expect(md.slice(t.desde, t.hasta)).toBe(t.t);
    expect(textos.map((t) => t.t)).toEqual(['Hola ', 'mundo', ' y ', 'código']);
  });
});
