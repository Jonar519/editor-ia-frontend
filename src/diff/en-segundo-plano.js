// Pide la diferencia por líneas al Web Worker (uno solo, creado al primer uso). Cada pedido tiene su id:
// las respuestas pueden llegar en cualquier orden.

/** @type {Worker | null} */
let trabajador = null;
let siguiente = 0;
/** @type {Map<number, { resolver: (ops: import('./lineas.js').Operacion[]) => void, rechazar: (e: Error) => void }>} */
const pendientes = new Map();

function elTrabajador() {
  if (trabajador) return trabajador;
  const t = new Worker(new URL('./trabajador.js', import.meta.url), { type: 'module', name: 'diferencias' });
  t.addEventListener('message', (ev) => {
    const r = /** @type {{ id: number, ops?: import('./lineas.js').Operacion[], error?: string }} */ (ev.data);
    const p = pendientes.get(r.id);
    if (!p) return;
    pendientes.delete(r.id);
    if (r.ops) p.resolver(r.ops);
    else p.rechazar(new Error(r.error ?? 'diferencia: error desconocido'));
  });
  t.addEventListener('error', () => {
    // El trabajador falló entero: todo lo pendiente falla y el próximo pedido crea otro.
    for (const p of pendientes.values()) p.rechazar(new Error('diferencia: el trabajador falló'));
    pendientes.clear();
    trabajador = null;
  });
  trabajador = t;
  return t;
}

/**
 * Las operaciones que llevan de `a` a `b`, calculadas fuera del hilo principal.
 * @param {string} a @param {string} b
 * @returns {Promise<import('./lineas.js').Operacion[]>}
 */
export function diferenciaEnSegundoPlano(a, b) {
  const id = ++siguiente;
  return new Promise((resolver, rechazar) => {
    pendientes.set(id, { resolver, rechazar });
    elTrabajador().postMessage({ id, a, b });
  });
}
