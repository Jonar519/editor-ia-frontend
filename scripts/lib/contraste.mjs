// Contraste WCAG 2.x entre los colores semánticos, en los dos temas. Los semánticos se resuelven
// siguiendo var() hasta un primitivo hexadecimal de tokens.css.
import { analizarCss, variablesUsadas } from './css.mjs';

/**
 * "#abc" o "#aabbcc" → [r, g, b] de 0 a 255.
 * @param {string} hex
 */
export function hexARgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`color no hexadecimal: ${hex}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/**
 * Luminancia relativa (WCAG 2.x, sRGB).
 * @param {string} hex
 */
export function luminancia(hex) {
  const [r = 0, g = 0, b = 0] = hexARgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Razón de contraste (de 1 a 21).
 * @param {string} a
 * @param {string} b
 */
export function contraste(a, b) {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return ((claro ?? 0) + 0.05) / ((oscuro ?? 0) + 0.05);
}

/**
 * Valores de las variables de :root en cada tema. "claro" = :root sin @media; "oscuro" = "claro" con
 * lo que redefine @media (prefers-color-scheme: dark).
 * @param {string} tokensCss
 */
export function temas(tokensCss) {
  const hoja = analizarCss(tokensCss);
  /** @type {Map<string, string>} */
  const claro = new Map();
  /** @type {Map<string, string>} */
  const soloOscuro = new Map();
  for (const d of hoja.declaraciones) {
    if (d.selector !== ':root' || !d.propiedad.startsWith('--')) continue;
    if (d.contexto.length === 0) claro.set(d.propiedad, d.valor);
    else if (d.contexto.some((c) => /prefers-color-scheme:\s*dark/.test(c))) soloOscuro.set(d.propiedad, d.valor);
  }
  return { claro, oscuro: new Map([...claro, ...soloOscuro]), soloOscuro };
}

/**
 * Sigue var() hasta un valor final.
 * @param {string} nombre
 * @param {Map<string, string>} tema
 * @returns {string}
 */
export function resolver(nombre, tema, vistos = new Set()) {
  if (vistos.has(nombre)) throw new Error(`ciclo de variables en ${nombre}`);
  vistos.add(nombre);
  const valor = tema.get(nombre);
  if (valor === undefined) throw new Error(`variable sin definir: ${nombre}`);
  const [siguiente] = variablesUsadas(valor);
  if (siguiente && valor.trim().startsWith('var(')) return resolver(siguiente, tema, vistos);
  return valor.trim();
}

/**
 * Primitivo (--paleta-*) al que apunta un semántico, siguiendo la cadena de var().
 * @param {string} nombre
 * @param {Map<string, string>} tema
 */
export function primitivoDe(nombre, tema) {
  let actual = nombre;
  for (let i = 0; i < 20; i++) {
    const valor = tema.get(actual);
    const [siguiente] = valor ? variablesUsadas(valor) : [];
    if (!siguiente) return actual;
    actual = siguiente;
  }
  throw new Error(`cadena de variables demasiado larga en ${nombre}`);
}

/**
 * @typedef {{ texto: string, fondo: string, minimo: number, nota?: string }} Par
 * @typedef {{ tema: string, texto: string, fondo: string, minimo: number, razon: number, cumple: boolean }} Medida
 */

/**
 * Mide cada par en los dos temas.
 * @param {string} tokensCss
 * @param {Par[]} pares
 * @returns {Medida[]}
 */
export function medirPares(tokensCss, pares) {
  const t = temas(tokensCss);
  /** @type {Medida[]} */
  const medidas = [];
  for (const [nombreTema, tema] of /** @type {const} */ ([['claro', t.claro], ['oscuro', t.oscuro]])) {
    for (const p of pares) {
      const razon = contraste(resolver(p.texto, tema), resolver(p.fondo, tema));
      medidas.push({ tema: nombreTema, texto: p.texto, fondo: p.fondo, minimo: p.minimo, razon, cumple: razon >= p.minimo });
    }
  }
  return medidas;
}
