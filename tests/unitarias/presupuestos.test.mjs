import { describe, expect, it } from 'vitest';
import { comparar, medir } from '../../scripts/lib/presupuestos.mjs';

// Manifiesto de Vite ficticio: entrada + un chunk compartido + vistas de cada grupo.
/** @type {import('../../scripts/lib/presupuestos.mjs').Manifiesto} */
const MANIFIESTO = {
  'index.html': { file: 'assets/index.js', src: 'index.html', isEntry: true, imports: ['_dom.js'], css: ['assets/index.css'], dynamicImports: ['src/vistas/publico/inicio.js'] },
  '_dom.js': { file: 'assets/dom.js' },
  'src/vistas/publico/inicio.js': { file: 'assets/inicio.js', src: 'src/vistas/publico/inicio.js', isDynamicEntry: true, imports: ['_dom.js'] },
  'src/vistas/lector/documentos.js': { file: 'assets/documentos.js', src: 'src/vistas/lector/documentos.js', isDynamicEntry: true, imports: ['_dom.js', '_lista.js'] },
  '_lista.js': { file: 'assets/lista.js' },
  'src/vistas/editor/editar.js': { file: 'assets/editar.js', src: 'src/vistas/editor/editar.js', isDynamicEntry: true, imports: ['_lista.js'], css: ['assets/editar.css'] },
  'src/vistas/admin/panel.js': { file: 'assets/panel.js', src: 'src/vistas/admin/panel.js', isDynamicEntry: true },
};

/** Tamaños comprimidos en bytes (1 KiB = 1024). */
const BYTES = {
  'assets/index.js': 10 * 1024,
  'assets/dom.js': 2 * 1024,
  'assets/inicio.js': 1024,
  'assets/documentos.js': 3 * 1024,
  'assets/lista.js': 4 * 1024,
  'assets/editar.js': 50 * 1024,
  'assets/panel.js': 5 * 1024,
  'assets/index.css': 3 * 1024,
  'assets/editar.css': 2 * 1024,
};
const tamano = (/** @type {string} */ a) => BYTES[/** @type {keyof typeof BYTES} */ (a)] ?? 0;

const ROLES = {
  publico: ['publico'],
  lector: ['publico', 'lector'],
  editor: ['publico', 'lector', 'editor'],
  admin: ['publico', 'lector', 'editor', 'admin'],
};

describe('medir', () => {
  const m = medir(MANIFIESTO, tamano, ROLES);

  it('primera carga = entrada + importaciones estáticas (no las vistas dinámicas)', () => {
    expect(m.primeraCargaJs).toBe(12); // index 10 + dom 2
  });

  it('JS por rol: primera carga + las vistas de sus grupos, sin contar dos veces lo compartido', () => {
    expect(m.jsPorRol).toEqual({
      publico: 13, // 12 + inicio 1
      lector: 20, // 13 + documentos 3 + lista 4 (dom ya contado)
      editor: 70, // 20 + editar 50 (lista ya contada)
      admin: 75, // 70 + panel 5
    });
  });

  it('el chunk más grande y el CSS total', () => {
    expect(m.maxChunkJs).toEqual({ archivo: 'assets/editar.js', kib: 50 });
    expect(m.cssTotal).toBe(5);
  });

  it('sin entrada en el manifiesto: error claro', () => {
    expect(() => medir({}, tamano, ROLES)).toThrow(/entrada/);
  });
});

describe('diferidas (bajo demanda desde una vista, fuera del JS del rol)', () => {
  // El editor importa con import() el envoltorio de highlight y dos lenguajes de CodeMirror.
  /** @type {import('../../scripts/lib/presupuestos.mjs').Manifiesto} */
  const CON_DIFERIDAS = {
    ...MANIFIESTO,
    'src/vistas/editor/editar.js': { ...MANIFIESTO['src/vistas/editor/editar.js'], file: 'assets/editar.js', dynamicImports: ['src/diferidas/highlight.js', 'node_modules/@codemirror/lang-python/dist/index.js', 'node_modules/@codemirror/lang-sql/dist/index.js'] },
    'src/diferidas/highlight.js': { file: 'assets/highlight.js', src: 'src/diferidas/highlight.js', isDynamicEntry: true, imports: ['_dom.js', '_hl-core.js'] },
    '_hl-core.js': { file: 'assets/hl-core.js' },
    // Python comparte con la vista del editor el chunk de "lista" (ya cargado cuando se pide).
    'node_modules/@codemirror/lang-python/dist/index.js': { file: 'assets/python.js', src: 'node_modules/@codemirror/lang-python/dist/index.js', isDynamicEntry: true, imports: ['_lista.js'] },
    'node_modules/@codemirror/lang-sql/dist/index.js': { file: 'assets/sql.js', src: 'node_modules/@codemirror/lang-sql/dist/index.js', isDynamicEntry: true },
  };
  const TAM = { ...BYTES, 'assets/highlight.js': 20 * 1024, 'assets/hl-core.js': 31 * 1024, 'assets/python.js': 12 * 1024, 'assets/sql.js': 9 * 1024 };
  const tam = (/** @type {string} */ a) => TAM[/** @type {keyof typeof TAM} */ (a)] ?? 0;
  const DIFERIDAS = {
    highlight: { patron: '^src/diferidas/highlight' },
    katex: { patron: '^src/diferidas/katex' },
    lenguaje: { patron: 'node_modules/@codemirror/(lang-|legacy-modes)', porChunk: true },
  };
  const m = medir(CON_DIFERIDAS, tam, ROLES, DIFERIDAS);

  it('una diferida cuenta lo que trae ADEMÁS de la primera carga (dom.js ya estaba)', () => {
    expect(m.diferidas.highlight).toMatchObject({ kib: 51, chunks: 1 }); // 20 + 31, sin dom
  });

  it('por chunk: cada lenguaje por separado; se compara el mayor; lo que ya cargó su importador no cuenta', () => {
    // python 12 KiB; su chunk compartido "lista" (4 KiB) ya lo trajo la vista del editor.
    expect(m.diferidas.lenguaje).toMatchObject({ kib: 12, chunks: 2 });
    expect(m.diferidas.lenguaje?.detalle).toMatch(/lang-python/);
  });

  it('sin chunks que coincidan: 0 y lo dice', () => {
    expect(m.diferidas.katex).toEqual({ kib: 0, chunks: 0, detalle: 'sin chunks' });
  });

  it('las diferidas NO entran al JS del rol (el editor sigue igual)', () => {
    expect(m.jsPorRol.editor).toBe(70);
  });

  it('con tope: se compara; sin tope (null): solo se informa', () => {
    const filas = comparar(m, {
      primeraCargaJs: null,
      jsPorRol: {},
      maxChunkJs: null,
      cssTotal: null,
      diferidas: { highlight: 50, katex: null, lenguaje: 35 },
    });
    expect(filas.filter((f) => f.excedido).map((f) => f.nombre)).toEqual([expect.stringMatching(/^Diferida highlight/)]);
  });
});

describe('comparar', () => {
  const m = medir(MANIFIESTO, tamano, ROLES);
  const SIN_TOPES = { primeraCargaJs: null, jsPorRol: { publico: null, lector: null, editor: null, admin: null }, maxChunkJs: null, cssTotal: null };

  it('topes en null (sin confirmar): se informa, nada se marca como excedido', () => {
    expect(comparar(m, SIN_TOPES).every((f) => f.tope === null && !f.excedido)).toBe(true);
  });

  it('con topes: se excede solo si la medida es MAYOR que el tope (igual cumple)', () => {
    const filas = comparar(m, { ...SIN_TOPES, primeraCargaJs: 12, jsPorRol: { ...SIN_TOPES.jsPorRol, editor: 69 }, cssTotal: 4 });
    const excedidas = filas.filter((f) => f.excedido).map((f) => f.nombre);
    expect(excedidas).toEqual(['JS del rol editor', 'CSS total']);
  });
});
