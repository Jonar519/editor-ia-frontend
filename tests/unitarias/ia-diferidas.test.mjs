// La IA se carga BAJO DEMANDA (bloque Q, decisión escrita: opción 1). Sobre el código fuente:
//   - nada fuera de src/diferidas/ importa ESTÁTICAMENTE una diferida de IA (si no, entra en el chunk de
//     la vista: el del editor, o la primera carga);
//   - cada vista importa con import() SOLO la suya: el editor, el panel y el autocompletado; la lectura,
//     el panel; la lista, la búsqueda;
//   - el panel y la búsqueda no alcanzan CodeMirror por ninguna importación estática (quien lee no lo
//     descarga al abrir la IA: ADR 0004).
// La E2E lo comprueba además en la red, con el build real.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/** Todos los .js de src/, con su ruta relativa ("vistas/editor/editar.js"). */
function archivos(/** @type {string} */ dir = SRC) {
  /** @type {string[]} */
  const r = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) r.push(...archivos(p));
    else if (e.name.endsWith('.js')) r.push(path.relative(SRC, p).split(path.sep).join('/'));
  }
  return r;
}

const leer = (/** @type {string} */ rel) => readFileSync(path.join(SRC, rel), 'utf8');

/** Sin comentarios: los tipos JSDoc también escriben import('…'), y no cargan nada. */
const sinComentarios = (/** @type {string} */ codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Especificadores de las importaciones ESTÁTICAS (import … from, import '…', export … from). */
function estaticas(/** @type {string} */ codigo) {
  /** @type {string[]} */
  const r = [];
  for (const m of sinComentarios(codigo).matchAll(/^\s*(?:import|export)\s+(?:[^'"();]*?\s+from\s+)?['"]([^'"]+)['"]/gm)) r.push(/** @type {string} */ (m[1]));
  return r;
}

/** Especificadores de los import() dinámicos (sin repetir). */
const dinamicas = (/** @type {string} */ codigo) => [...new Set([...sinComentarios(codigo).matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => /** @type {string} */ (m[1])))];

const resolver = (/** @type {string} */ desde, /** @type {string} */ esp) => path.posix.normalize(path.posix.join(path.posix.dirname(desde), esp));

/** Todo lo que alcanza `rel` por importaciones estáticas: archivos de src/ y paquetes. */
function alcance(/** @type {string} */ rel, /** @type {Set<string>} */ vistos = new Set()) {
  if (vistos.has(rel)) return vistos;
  vistos.add(rel);
  if (!rel.endsWith('.js') || rel.startsWith('pkg:')) return vistos;
  for (const esp of estaticas(leer(rel))) {
    if (esp.startsWith('.')) alcance(resolver(rel, esp), vistos);
    else vistos.add(`pkg:${esp}`);
  }
  return vistos;
}

/** Las tres diferidas de IA (ia-mensajes.js e ia-sse.js son auxiliares del panel y la búsqueda). */
const DIFERIDA_IA = /(^|\/)diferidas\/ia(-autocompletado|-busqueda)?\.js$/;
const diferidasIaDe = (/** @type {string} */ rel, /** @type {string[]} */ esps) => esps.map((e) => resolver(rel, e)).filter((r) => DIFERIDA_IA.test(r)).sort();

describe('carga diferida de la IA', () => {
  it('ningún archivo fuera de src/diferidas/ importa estáticamente una diferida de IA', () => {
    const malos = archivos()
      .filter((rel) => !rel.startsWith('diferidas/'))
      .flatMap((rel) => diferidasIaDe(rel, estaticas(leer(rel))).map((d) => `${rel} → ${d}`));
    expect(malos).toEqual([]);
  });

  it('cada vista importa con import() solo su diferida', () => {
    const quien = Object.fromEntries(
      archivos()
        .filter((rel) => !rel.startsWith('diferidas/'))
        .map((rel) => /** @type {[string, string[]]} */ ([rel, diferidasIaDe(rel, dinamicas(leer(rel)))]))
        .filter(([, d]) => d.length > 0),
    );
    expect(quien).toEqual({
      'vistas/editor/editar.js': ['diferidas/ia-autocompletado.js', 'diferidas/ia.js'],
      'vistas/lector/documento.js': ['diferidas/ia.js'],
      'vistas/lector/documentos.js': ['diferidas/ia-busqueda.js'],
    });
  });

  it('el panel y la búsqueda no alcanzan CodeMirror (ni otra diferida de IA) por importaciones estáticas', () => {
    for (const d of ['diferidas/ia.js', 'diferidas/ia-busqueda.js']) {
      const a = [...alcance(d)];
      expect(a.filter((x) => /codemirror/.test(x)), d).toEqual([]);
      expect(a.filter((x) => x !== d && DIFERIDA_IA.test(x)), d).toEqual([]);
    }
    // La búsqueda tampoco trae el renderizador de Markdown (la lista no lo tiene).
    expect([...alcance('diferidas/ia-busqueda.js')].filter((x) => x.startsWith('markdown/'))).toEqual([]);
  });

  it('el detector de importaciones ve las formas que usa el código (control de la prueba)', () => {
    expect(estaticas("import { a } from './x.js';\nimport './y.js';\nexport { b } from '../z.js';\n// import './comentado.js';")).toEqual(['./x.js', './y.js', '../z.js']);
    expect(estaticas("import {\n  a,\n  b,\n} from '@codemirror/state';")).toEqual(['@codemirror/state']);
    expect(dinamicas("void import('../../diferidas/ia.js').then(f)\n/** @type {import('../../diferidas/ia.js')['x']} */")).toEqual(['../../diferidas/ia.js']);
  });
});
