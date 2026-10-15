// Analizador mínimo de CSS para las auditorías (sin dependencias). Entiende lo que usa este proyecto:
// reglas con declaraciones, @media/@supports anidados y @keyframes. Devuelve cada declaración con su
// selector, su contexto (@media que la envuelven) y su línea, para dar mensajes precisos.

/**
 * @typedef {{ propiedad: string, valor: string, selector: string, contexto: string[], linea: number }} Declaracion
 * @typedef {{ declaraciones: Declaracion[], keyframes: { nombre: string, linea: number }[] }} HojaCss
 */

/**
 * Reemplaza los comentarios por espacios (conserva los saltos de línea para no mover las líneas).
 * @param {string} texto
 */
export function quitarComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, (/** @type {string} */ c) => c.replace(/[^\n]/g, ' '));
}

/**
 * Parte por ";" de primer nivel (no dentro de paréntesis ni de comillas).
 * @param {string} cuerpo
 */
function partirDeclaraciones(cuerpo) {
  /** @type {{ texto: string, desplazamiento: number }[]} */
  const partes = [];
  let profundidad = 0;
  /** @type {string | null} */
  let comilla = null;
  let inicio = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const c = cuerpo[i];
    if (comilla) {
      if (c === comilla && cuerpo[i - 1] !== '\\') comilla = null;
    } else if (c === '"' || c === "'") comilla = c;
    else if (c === '(') profundidad++;
    else if (c === ')') profundidad--;
    else if (c === ';' && profundidad === 0) {
      partes.push({ texto: cuerpo.slice(inicio, i), desplazamiento: inicio });
      inicio = i + 1;
    }
  }
  partes.push({ texto: cuerpo.slice(inicio), desplazamiento: inicio });
  return partes;
}

/**
 * Posición de la llave que cierra la que abre en `desde`.
 * @param {string} texto
 * @param {number} desde
 */
function cierre(texto, desde) {
  let profundidad = 0;
  for (let i = desde; i < texto.length; i++) {
    if (texto[i] === '{') profundidad++;
    else if (texto[i] === '}') {
      profundidad--;
      if (profundidad === 0) return i;
    }
  }
  throw new Error('CSS: llave sin cerrar');
}

/**
 * @param {string} textoOriginal
 * @returns {HojaCss}
 */
export function analizarCss(textoOriginal) {
  const texto = quitarComentarios(textoOriginal);
  /** @type {HojaCss} */
  const hoja = { declaraciones: [], keyframes: [] };
  const lineaDe = (/** @type {number} */ pos) => texto.slice(0, pos).split('\n').length;

  /**
   * @param {number} desde
   * @param {number} hasta
   * @param {string[]} contexto
   */
  function bloque(desde, hasta, contexto) {
    let i = desde;
    while (i < hasta) {
      const abre = texto.indexOf('{', i);
      if (abre === -1 || abre >= hasta) break;
      const preludio = texto.slice(i, abre).trim();
      const fin = cierre(texto, abre);
      if (/^@(media|supports|layer)\b/.test(preludio)) {
        bloque(abre + 1, fin, [...contexto, preludio.replace(/\s+/g, ' ')]);
      } else if (/^@keyframes\b/.test(preludio)) {
        hoja.keyframes.push({ nombre: preludio.replace(/^@keyframes\s+/, ''), linea: lineaDe(abre) });
      } else {
        const cuerpo = texto.slice(abre + 1, fin);
        for (const parte of partirDeclaraciones(cuerpo)) {
          const dos = parte.texto.indexOf(':');
          if (dos === -1 || !parte.texto.trim()) continue;
          hoja.declaraciones.push({
            propiedad: parte.texto.slice(0, dos).trim().toLowerCase(),
            valor: parte.texto.slice(dos + 1).trim(),
            selector: preludio.replace(/\s+/g, ' '),
            contexto,
            linea: lineaDe(abre + 1 + parte.desplazamiento + parte.texto.search(/\S/)),
          });
        }
      }
      i = fin + 1;
    }
  }

  bloque(0, texto.length, []);
  return hoja;
}

/**
 * Nombres de las variables CSS que usa un valor: "1px solid var(--a)" → ["--a"].
 * @param {string} valor
 */
export function variablesUsadas(valor) {
  return [...valor.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] ?? '');
}
