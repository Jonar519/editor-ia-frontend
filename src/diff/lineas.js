// Diferencia por líneas (algoritmo de Myers, O((N+M)·D)) para comparar versiones (bloque N). Corre en un
// Web Worker (trabajador.js): un documento grande no congela la página. El backend tiene la misma función
// para restaurar (src/versiones/lineas.ts).
//
// Una "línea" incluye su salto final: unir las líneas reproduce el texto EXACTO.

/**
 * @typedef {'igual' | 'quitar' | 'agregar'} TipoOperacion
 * @typedef {{ tipo: TipoOperacion, lineas: string[] }} Operacion
 */

/** "a\nb\nc" → ["a\n", "b\n", "c"] (el texto vacío no tiene líneas). */
export function partirLineas(/** @type {string} */ texto) {
  return texto === '' ? [] : texto.split(/(?<=\n)/);
}

/** @param {Operacion[]} ops @param {TipoOperacion} tipo @param {string} linea */
function empujar(ops, tipo, linea) {
  const ultima = ops.at(-1);
  if (ultima?.tipo === tipo) ultima.lineas.push(linea);
  else ops.push({ tipo, lineas: [linea] });
}

/**
 * Las operaciones que llevan de `a` a `b`, en orden.
 * @param {string} a @param {string} b
 * @returns {Operacion[]}
 */
export function diferenciaPorLineas(a, b) {
  const A = partirLineas(a);
  const B = partirLineas(b);
  let inicio = 0;
  while (inicio < A.length && inicio < B.length && A[inicio] === B[inicio]) inicio++;
  let finA = A.length;
  let finB = B.length;
  while (finA > inicio && finB > inicio && A[finA - 1] === B[finB - 1]) {
    finA--;
    finB--;
  }
  /** @type {Operacion[]} */
  const ops = [];
  for (let i = 0; i < inicio; i++) empujar(ops, 'igual', A[i] ?? '');
  for (const op of myers(A.slice(inicio, finA), B.slice(inicio, finB))) for (const l of op.lineas) empujar(ops, op.tipo, l);
  for (let i = finA; i < A.length; i++) empujar(ops, 'igual', A[i] ?? '');
  return ops;
}

/** @param {string[]} A @param {string[]} B @returns {Operacion[]} */
function myers(A, B) {
  const n = A.length;
  const m = B.length;
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d]: los x de la vuelta d-1 para k en [-d, d] (memoria O(D²)).
  /** @type {Int32Array[]} */
  const trace = [];
  let fin = -1;
  for (let d = 0; d <= max && fin < 0; d++) {
    trace.push(v.slice(off - d, off + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v[off + k - 1] ?? 0) < (v[off + k + 1] ?? 0)) ? (v[off + k + 1] ?? 0) : (v[off + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        fin = d;
        break;
      }
    }
  }
  /** @type {{ tipo: TipoOperacion, linea: string }[]} */
  const pasos = [];
  let x = n;
  let y = m;
  for (let d = fin; d > 0; d--) {
    const previa = trace[d] ?? new Int32Array(0);
    const en = (/** @type {number} */ k) => previa[k + d] ?? 0;
    const k = x - y;
    const kPrevio = k === -d || (k !== d && en(k - 1) < en(k + 1)) ? k + 1 : k - 1;
    const xPrevio = en(kPrevio);
    const yPrevio = xPrevio - kPrevio;
    while (x > xPrevio && y > yPrevio) {
      pasos.push({ tipo: 'igual', linea: A[x - 1] ?? '' });
      x--;
      y--;
    }
    if (x === xPrevio) pasos.push({ tipo: 'agregar', linea: B[y - 1] ?? '' });
    else pasos.push({ tipo: 'quitar', linea: A[x - 1] ?? '' });
    x = xPrevio;
    y = yPrevio;
  }
  while (x > 0 && y > 0) {
    pasos.push({ tipo: 'igual', linea: A[x - 1] ?? '' });
    x--;
    y--;
  }
  /** @type {Operacion[]} */
  const ops = [];
  for (const p of pasos.reverse()) empujar(ops, p.tipo, p.linea);
  return ops;
}
