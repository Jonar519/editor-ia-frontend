// Presencia (bloque L): quién está en el documento, con un color determinista por cuenta.
//
// Lo que dibuja y-codemirror.next sale de `state.user` ({ name, color, colorLight }) y entra tal cual en un
// atributo style. Por eso NO se confía en lo que manda otro cliente: al llegar cada estado remoto, `user`
// se reescribe con el nombre que puso el SERVIDOR (`usuario`, de la cuenta autenticada) y el color que
// sale del id de esa cuenta. Un color inventado ("red; background-image: url(…)") nunca llega al DOM.
//
// Los colores son tokens CSS (--color-presencia-N): aquí solo se nombran, nunca se escriben.
import * as Y from 'yjs';

/** Cantidad de colores de la paleta de presencia (tokens --color-presencia-1 … N). */
export const COLORES_PRESENCIA = 8;

/**
 * Índice de color (1…n) de una cuenta: FNV-1a de 32 bits sobre su id. El mismo id da el mismo color en
 * todos los navegadores; dos cuentas pueden compartir color (por eso el nombre va siempre a la vista).
 * @param {string} id
 * @param {number} [n]
 */
export function indiceColor(id, n = COLORES_PRESENCIA) {
  let x = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    x ^= id.charCodeAt(i);
    x = Math.imul(x, 0x01000193);
  }
  return ((x >>> 0) % n) + 1;
}

/** Lo que dibuja el editor para una cuenta: nombre, cursor y selección. */
export function usuarioParaDibujar(/** @type {string} */ id, /** @type {string} */ nombre) {
  const i = indiceColor(id);
  return { name: nombre, color: `var(--color-presencia-${String(i)})`, colorLight: `var(--color-presencia-${String(i)}-seleccion)` };
}

/**
 * La cuenta de un estado de presencia, tal como la puso el servidor; null si no la trae (no se dibuja).
 * @param {unknown} estado
 * @returns {{ id: string, nombre: string } | null}
 */
export function cuentaDe(estado) {
  const u = /** @type {{ usuario?: { id?: unknown, nombre?: unknown } } | null} */ (estado)?.usuario;
  return u && typeof u.id === 'string' && typeof u.nombre === 'string' ? { id: u.id, nombre: u.nombre } : null;
}

/** null o undefined (en JSON, un campo ausente). */
const falta = (/** @type {unknown} */ x) => x === null || x === undefined;
const esId = (/** @type {any} */ x) => !falta(x) && Number.isSafeInteger(x.client) && Number.isSafeInteger(x.clock) && x.client >= 0 && x.clock >= 0;

/**
 * Una posición relativa de Yjs rearmada con todos sus campos, o null si no tiene forma válida. y-codemirror
 * la usa tal cual: sin `item: null` explícito (así la serializa relativePositionToJSON) el plugin de
 * cursores se cae y la persona se queda sin ver ni publicar cursores (medido en la prueba en vivo de L).
 * @param {any} p
 */
export function posicionSegura(p) {
  if (typeof p !== 'object' || p === null) return null;
  if (!falta(p.type) && !esId(p.type)) return null;
  if (!falta(p.item) && !esId(p.item)) return null;
  if (!falta(p.tname) && typeof p.tname !== 'string') return null;
  if (falta(p.type) && falta(p.item) && falta(p.tname)) return null;
  if (!falta(p.assoc) && !Number.isSafeInteger(p.assoc)) return null;
  return Y.createRelativePositionFromJSON(p);
}

/**
 * Reescribe `user` de cada estado remoto, y su cursor con forma válida (o sin cursor). Hay que
 * registrarlo ANTES que el editor: los oyentes de la presencia se llaman en orden y el editor redibuja
 * dentro del suyo.
 * @param {import('y-protocols/awareness').Awareness} presencia
 */
export function normalizarPresencia(presencia) {
  /** @param {{ added: number[], updated: number[] }} cambios */
  const alCambio = ({ added, updated }) => {
    const estados = presencia.getStates();
    for (const id of [...added, ...updated]) {
      if (id === presencia.clientID) continue;
      const estado = estados.get(id);
      if (!estado) continue;
      const cuenta = cuentaDe(estado);
      if (!cuenta) {
        estados.delete(id);
        continue;
      }
      estado.user = usuarioParaDibujar(cuenta.id, cuenta.nombre);
      if (!falta(estado.cursor)) {
        const anchor = posicionSegura(estado.cursor.anchor);
        const head = posicionSegura(estado.cursor.head);
        estado.cursor = anchor && head ? { anchor, head } : null;
      }
    }
  };
  presencia.on('change', alCambio);
  return () => presencia.off('change', alCambio);
}

/**
 * Las personas presentes (sin repetir: la misma cuenta en dos pestañas cuenta una vez), ordenadas por
 * nombre. Incluye a quien mira.
 * @param {import('y-protocols/awareness').Awareness} presencia
 * @param {{ id: string, nombre: string }} yo
 */
export function personasPresentes(presencia, yo) {
  /** @type {Map<string, { id: string, nombre: string, indice: number, soyYo: boolean }>} */
  const personas = new Map([[yo.id, { ...yo, indice: indiceColor(yo.id), soyYo: true }]]);
  for (const [id, estado] of presencia.getStates()) {
    if (id === presencia.clientID) continue;
    const c = cuentaDe(estado);
    if (c && !personas.has(c.id)) personas.set(c.id, { ...c, indice: indiceColor(c.id), soyYo: false });
  }
  return [...personas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}
