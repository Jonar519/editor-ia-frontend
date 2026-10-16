// Auditoría de SIGNIFICADO de color. Reglas:
//   R1  Cada --color-* de tokens.css tiene su significado registrado (significados.json) y viceversa.
//   R2  Cada --color-* está definido en los DOS temas (claro y oscuro).
//   R3  Colores literales solo en tokens.css, y ahí solo en primitivos (--paleta-*).
//   R4  Fuera de tokens.css nadie usa primitivos (--paleta-*): solo significados.
//   R5  Cada --color-* se usa solo en las propiedades CSS que su significado permite.
//   R6  Los colores de estado (acento, info, éxito, aviso, peligro) no comparten tono en ningún tema:
//       dos significados distintos no se ven iguales.
//   R7  Una sola animación: un único @keyframes, usado solo con prefers-reduced-motion: no-preference,
//       y ninguna transición.
import { analizarCss, quitarComentarios, variablesUsadas } from './css.mjs';
import { primitivoDe, temas } from './contraste.mjs';

/**
 * @typedef {{ archivo: string, texto: string }} Archivo
 * @typedef {{ significado: string, usos: string[] }} Significado
 * @typedef {{ colores: Record<string, Significado>, estados: string[] }} Registro
 * @typedef {{ regla: string, archivo: string, linea?: number, mensaje: string }} Problema
 */

/** Colores literales: hexadecimales, funciones de color y nombres de color de CSS más comunes. */
const LITERAL = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/i;
/**
 * En el JavaScript, los NOMBRES de color solo cuentan en un contexto de estilo: en español "red" es la
 * red (de conexión), no el color. Hexadecimales y funciones de color cuentan siempre.
 */
const LITERAL_SIN_NOMBRES = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const CONTEXTO_DE_ESTILO = /\.style\b|setProperty\(|cssText|\bstyle\s*[=:]/;

/**
 * Quita los comentarios de línea (//) de una línea de JavaScript, sin tocar los "//" dentro de cadenas
 * (por ejemplo, "http://").
 * @param {string} linea
 */
function sinComentarioDeLinea(linea) {
  /** @type {string | null} */
  let comilla = null;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comilla) {
      if (c === comilla && linea[i - 1] !== '\\') comilla = null;
    } else if (c === '"' || c === "'" || c === '`') comilla = c;
    else if (c === '/' && linea[i + 1] === '/') return linea.slice(0, i);
  }
  return linea;
}

/**
 * @param {{ tokens: Archivo, css: Archivo[], js: Archivo[], registro: Registro }} e
 * @returns {Problema[]}
 */
export function auditarColores(e) {
  /** @type {Problema[]} */
  const problemas = [];
  const t = temas(e.tokens.texto);
  const semanticos = [...t.claro.keys()].filter((n) => n.startsWith('--color-'));
  const registrados = Object.keys(e.registro.colores);

  // R1 y R2
  for (const n of semanticos) {
    if (!registrados.includes(n)) problemas.push({ regla: 'R1', archivo: e.tokens.archivo, mensaje: `${n} no tiene significado registrado` });
    if (!t.soloOscuro.has(n)) problemas.push({ regla: 'R2', archivo: e.tokens.archivo, mensaje: `${n} no está definido en el tema oscuro` });
  }
  for (const n of registrados) {
    if (!semanticos.includes(n)) problemas.push({ regla: 'R1', archivo: e.tokens.archivo, mensaje: `${n} está registrado pero no existe en tokens.css` });
  }

  // R3 en tokens.css: literales solo en primitivos.
  for (const d of analizarCss(e.tokens.texto).declaraciones) {
    if (LITERAL.test(d.valor) && !d.propiedad.startsWith('--paleta-')) {
      problemas.push({ regla: 'R3', archivo: e.tokens.archivo, linea: d.linea, mensaje: `color literal fuera de un primitivo: ${d.propiedad}: ${d.valor}` });
    }
  }

  // R3, R4, R5 y R7 en el resto del CSS.
  let keyframes = analizarCss(e.tokens.texto).keyframes.length;
  for (const a of e.css) {
    const hoja = analizarCss(a.texto);
    keyframes += hoja.keyframes.length;
    for (const d of hoja.declaraciones) {
      if (LITERAL.test(d.valor)) problemas.push({ regla: 'R3', archivo: a.archivo, linea: d.linea, mensaje: `color literal: ${d.propiedad}: ${d.valor}` });
      for (const v of variablesUsadas(d.valor)) {
        if (v.startsWith('--paleta-')) problemas.push({ regla: 'R4', archivo: a.archivo, linea: d.linea, mensaje: `usa el primitivo ${v}: usa un significado (--color-*)` });
        if (!v.startsWith('--color-')) continue;
        const s = e.registro.colores[v];
        if (!s) problemas.push({ regla: 'R5', archivo: a.archivo, linea: d.linea, mensaje: `${v} no existe` });
        else if (!s.usos.includes(d.propiedad)) {
          problemas.push({ regla: 'R5', archivo: a.archivo, linea: d.linea, mensaje: `${v} ("${s.significado}") no se usa en ${d.propiedad}; se permite en: ${s.usos.join(', ')}` });
        }
      }
      if (d.propiedad === 'transition' || d.propiedad.startsWith('transition-')) {
        problemas.push({ regla: 'R7', archivo: a.archivo, linea: d.linea, mensaje: 'transición: la interfaz tiene una sola animación (@keyframes aparecer)' });
      }
      if ((d.propiedad === 'animation' || d.propiedad === 'animation-name') && !d.contexto.some((c) => /prefers-reduced-motion:\s*no-preference/.test(c))) {
        problemas.push({ regla: 'R7', archivo: a.archivo, linea: d.linea, mensaje: 'animación fuera de @media (prefers-reduced-motion: no-preference)' });
      }
    }
  }
  if (keyframes !== 1) problemas.push({ regla: 'R7', archivo: '(todo el CSS)', mensaje: `hay ${String(keyframes)} @keyframes; debe haber exactamente 1` });

  // R3 y R4 en el JavaScript (estilos en línea).
  for (const a of e.js) {
    quitarComentarios(a.texto)
      .split('\n')
      .forEach((/** @type {string} */ original, /** @type {number} */ i) => {
        const l = sinComentarioDeLinea(original);
        if (/--paleta-/.test(l)) problemas.push({ regla: 'R4', archivo: a.archivo, linea: i + 1, mensaje: 'usa un primitivo (--paleta-*)' });
        const literal = CONTEXTO_DE_ESTILO.test(l) ? LITERAL : LITERAL_SIN_NOMBRES;
        for (const cadena of l.match(/(['"`])(?:(?!\1).)*\1/g) ?? []) {
          if (literal.test(cadena)) problemas.push({ regla: 'R3', archivo: a.archivo, linea: i + 1, mensaje: `color literal en una cadena: ${cadena}` });
        }
      });
  }

  // R6
  for (const [nombreTema, tema] of /** @type {const} */ ([['claro', t.claro], ['oscuro', t.oscuro]])) {
    /** @type {Map<string, string>} */
    const visto = new Map();
    for (const estado of e.registro.estados) {
      const p = primitivoDe(estado, tema);
      const otro = visto.get(p);
      if (otro) problemas.push({ regla: 'R6', archivo: e.tokens.archivo, mensaje: `tema ${nombreTema}: ${estado} y ${otro} usan el mismo tono (${p})` });
      visto.set(p, estado);
    }
  }
  return problemas;
}
