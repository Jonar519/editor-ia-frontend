import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditarColores } from '../../scripts/lib/colores.mjs';

const TOKENS = `:root {
  --paleta-blanco: #ffffff;
  --paleta-negro: #000000;
  --paleta-azul: #1d4f9f;
  --paleta-rojo: #b3261e;
  --color-fondo: var(--paleta-blanco);
  --color-texto: var(--paleta-negro);
  --color-acento: var(--paleta-azul);
  --color-peligro: var(--paleta-rojo);
}
@media (prefers-color-scheme: dark) {
  :root {
    --color-fondo: var(--paleta-negro);
    --color-texto: var(--paleta-blanco);
    --color-acento: var(--paleta-azul);
    --color-peligro: var(--paleta-rojo);
  }
}`;

const REGISTRO = {
  colores: {
    '--color-fondo': { significado: 'fondo', usos: ['background-color'] },
    '--color-texto': { significado: 'texto', usos: ['color'] },
    '--color-acento': { significado: 'acción principal', usos: ['background-color'] },
    '--color-peligro': { significado: 'error', usos: ['color', 'border-color'] },
  },
  estados: ['--color-acento', '--color-peligro'],
};

const CSS_BIEN = `body { background-color: var(--color-fondo); color: var(--color-texto); }
@keyframes aparecer { from { opacity: 0 } to { opacity: 1 } }
@media (prefers-reduced-motion: no-preference) { .vista { animation: aparecer 160ms ease-out; } }`;

/**
 * @param {{ tokens?: string, css?: string, js?: string, registro?: import('../../scripts/lib/colores.mjs').Registro }} [c]
 */
const auditar = (c = {}) =>
  auditarColores({
    tokens: { archivo: 'tokens.css', texto: c.tokens ?? TOKENS },
    css: [{ archivo: 'base.css', texto: c.css ?? CSS_BIEN }],
    js: [{ archivo: 'vista.js', texto: c.js ?? "export const a = h('p', { class: 'suave' }, 'Hola');" }],
    registro: c.registro ?? REGISTRO,
  });

const reglas = (/** @type {ReturnType<typeof auditar>} */ p) => p.map((x) => x.regla);

describe('auditoría de significado de color', () => {
  it('un proyecto que cumple todo: sin problemas', () => {
    expect(auditar()).toEqual([]);
  });

  it('R1: un color sin significado registrado, o uno registrado que no existe', () => {
    /** @type {Record<string, { significado: string, usos: string[] }>} */
    const sinPeligro = { ...REGISTRO.colores };
    delete sinPeligro['--color-peligro'];
    expect(reglas(auditar({ registro: { colores: sinPeligro, estados: ['--color-acento'] } }))).toContain('R1');
    const deMas = { ...REGISTRO, colores: { ...REGISTRO.colores, '--color-fantasma': { significado: 'x', usos: ['color'] } } };
    expect(reglas(auditar({ registro: deMas }))).toContain('R1');
  });

  it('R2: un color que no está definido en el tema oscuro', () => {
    expect(reglas(auditar({ tokens: TOKENS.replace('    --color-peligro: var(--paleta-rojo);\n  }\n}', '  }\n}') }))).toContain('R2');
  });

  it('R3: colores literales fuera de los primitivos (tokens, CSS y cadenas del JS)', () => {
    expect(reglas(auditar({ tokens: TOKENS.replace('--color-fondo: var(--paleta-blanco)', '--color-fondo: #fafafa') }))).toContain('R3');
    expect(reglas(auditar({ css: `${CSS_BIEN}\np { color: #333; }` }))).toContain('R3');
    expect(reglas(auditar({ css: `${CSS_BIEN}\np { color: rgb(0 0 0); }` }))).toContain('R3');
    expect(reglas(auditar({ css: `${CSS_BIEN}\np { border-color: red; }` }))).toContain('R3');
    expect(reglas(auditar({ js: "el.style.color = '#ff0000';" }))).toContain('R3');
    expect(reglas(auditar({ js: "el.style.color = 'red';" }))).toContain('R3');
    expect(reglas(auditar({ js: "el.style.setProperty('border-color', 'navy');" }))).toContain('R3');
  });

  it('R3 en JS: "red" en español (la red de conexión) NO es un color; los comentarios // tampoco cuentan', () => {
    expect(auditar({ js: "throw new ErrorApi({ codigo: 'red', mensaje: 'Revisa tu red.' });" })).toEqual([]);
    expect(auditar({ js: "if (que === 'red-primero') return;" })).toEqual([]);
    // Un comentario que documenta código viejo con un color entre comillas no es código.
    expect(auditar({ js: "const a = 1; // antes: el.style.color = '#ff0000'" })).toEqual([]);
    expect(auditar({ js: "fetch('http://127.0.0.1/a'); // nada" })).toEqual([]);
    // Un hexadecimal en una cadena sí cuenta aunque no sea un estilo (puede terminar en uno).
    expect(reglas(auditar({ js: "const c = '#fff';" }))).toEqual(['R3']);
  });

  it('R4: un componente que usa un primitivo en vez de un significado', () => {
    expect(reglas(auditar({ css: `${CSS_BIEN}\np { color: var(--paleta-rojo); }` }))).toContain('R4');
    expect(reglas(auditar({ js: "el.style.setProperty('color', 'var(--paleta-azul)');" }))).toContain('R4');
  });

  it('R5: un significado usado donde no corresponde (el texto como fondo, el peligro como acción)', () => {
    const p = auditar({ css: `${CSS_BIEN}\n.boton { background-color: var(--color-peligro); }` });
    expect(reglas(p)).toEqual(['R5']);
    expect(p[0]?.mensaje).toMatch(/--color-peligro \("error"\) no se usa en background-color/);
    expect(reglas(auditar({ css: `${CSS_BIEN}\np { color: var(--color-inexistente); }` }))).toEqual(['R5']);
  });

  it('R6: dos estados con el mismo tono en algún tema', () => {
    const iguales = TOKENS.replace('    --color-peligro: var(--paleta-rojo);\n  }', '    --color-peligro: var(--paleta-azul);\n  }');
    const p = auditar({ tokens: iguales });
    expect(reglas(p)).toEqual(['R6']);
    expect(p[0]?.mensaje).toMatch(/tema oscuro/);
  });

  it('R7: una sola animación, solo sin reducción de movimiento, y ninguna transición', () => {
    expect(reglas(auditar({ css: `${CSS_BIEN}\n@keyframes otra { to { opacity: 0 } }` }))).toEqual(['R7']);
    expect(reglas(auditar({ css: CSS_BIEN.replace(/@keyframes[^\n]+\n/, '') }))).toEqual(['R7']);
    expect(reglas(auditar({ css: `${CSS_BIEN}\n.otra { animation: aparecer 1s; }` }))).toEqual(['R7']);
    expect(reglas(auditar({ css: `${CSS_BIEN}\na { transition: color 0.2s; }` }))).toEqual(['R7']);
  });
});

describe('el proyecto real cumple la auditoría', () => {
  it('src/ y index.html: sin problemas', () => {
    const raiz = path.join(import.meta.dirname, '../..');
    const leer = (/** @type {string} */ a) => ({ archivo: a, texto: readFileSync(path.join(raiz, a), 'utf8') });
    const todos = readdirSync(path.join(raiz, 'src'), { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => path.relative(raiz, path.join(f.parentPath, f.name)).split(path.sep).join('/'));
    const problemas = auditarColores({
      tokens: leer('src/estilos/tokens.css'),
      css: todos.filter((a) => a.endsWith('.css') && !a.endsWith('tokens.css')).map(leer),
      js: [...todos.filter((a) => a.endsWith('.js')), 'index.html'].map(leer),
      registro: JSON.parse(readFileSync(path.join(raiz, 'src/estilos/significados.json'), 'utf8')),
    });
    expect(problemas).toEqual([]);
  });
});
