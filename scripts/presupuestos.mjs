// Presupuestos del build (después de "npm run build"). Mide KiB con gzip y compara con presupuestos.json.
// Un tope en null está pendiente de confirmación escrita: se informa y no falla. Con número, si se pasa,
// sale con 1. Uso: node scripts/presupuestos.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { comparar, medir } from './lib/presupuestos.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');

/** @type {import('./lib/presupuestos.mjs').Manifiesto} */
let manifiesto;
try {
  manifiesto = JSON.parse(readFileSync(path.join(DIST, '.vite/manifest.json'), 'utf8'));
} catch {
  console.error('No hay build: corre "npm run build" antes.');
  process.exit(2);
}
/**
 * @type {{ estado: string, roles: Record<string, string[]>, diferidas?: Record<string, import('./lib/presupuestos.mjs').Diferida>,
 *   topesKiBGzip: import('./lib/presupuestos.mjs').Topes }}
 */
const config = JSON.parse(readFileSync(path.join(RAIZ, 'presupuestos.json'), 'utf8'));

// Nivel 9: el peor caso para nosotros es el mejor caso de compresión del servidor; no nos favorece.
const bytesGzip = (/** @type {string} */ archivo) => gzipSync(readFileSync(path.join(DIST, archivo)), { level: 9 }).length;
const filas = comparar(medir(manifiesto, bytesGzip, config.roles, config.diferidas), config.topesKiBGzip);

console.log(`Presupuestos (KiB con gzip). Estado: ${config.estado}\n`);
for (const f of filas) {
  const estado = f.tope === null ? 'SIN TOPE CONFIRMADO' : f.excedido ? `EXCEDE el tope de ${String(f.tope)}` : `OK (tope ${String(f.tope)})`;
  console.log(`  ${f.nombre.padEnd(52)} ${f.medido.toFixed(2).padStart(8)}  ${estado}`);
}
const excedidos = filas.filter((f) => f.excedido);
const pendientes = filas.filter((f) => f.tope === null);
if (pendientes.length > 0) console.log(`\n${String(pendientes.length)} tope(s) sin confirmar: se miden, no se aplican.`);
if (excedidos.length > 0) {
  console.error(`\nPRESUPUESTO EXCEDIDO en ${String(excedidos.length)} medida(s). No se sube un tope para que pase: se reduce el código o se consulta.`);
  process.exit(1);
}
console.log('\nPresupuestos: OK.');
