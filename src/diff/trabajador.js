// Web Worker de la diferencia por líneas (bloque N): recibe { id, a, b } y responde { id, ops } (o { id,
// error }). Fuera del hilo principal: comparar dos versiones grandes no congela la página.
import { diferenciaPorLineas } from './lineas.js';

self.addEventListener('message', (ev) => {
  const { id, a, b } = /** @type {{ id: number, a: string, b: string }} */ (ev.data);
  try {
    self.postMessage({ id, ops: diferenciaPorLineas(a, b) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
});
