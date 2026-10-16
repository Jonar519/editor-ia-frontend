// Auditoría de significado de color (reglas R1–R7 en scripts/lib/colores.mjs). Sale con 1 si hay problemas.
// Uso: node scripts/colores.mjs
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditarColores } from './lib/colores.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKENS = 'src/estilos/tokens.css';

/** @returns {string[]} rutas relativas a la raíz, con "/" */
function archivos(/** @type {string} */ dir, /** @type {RegExp} */ patron) {
  return readdirSync(path.join(RAIZ, dir), { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && patron.test(f.name))
    .map((f) => path.relative(RAIZ, path.join(f.parentPath, f.name)).split(path.sep).join('/'));
}

const leer = (/** @type {string} */ archivo) => ({ archivo, texto: readFileSync(path.join(RAIZ, archivo), 'utf8') });

const problemas = auditarColores({
  tokens: leer(TOKENS),
  css: archivos('src', /\.css$/).filter((a) => a !== TOKENS).map(leer),
  js: [...archivos('src', /\.js$/), 'index.html'].map(leer),
  registro: JSON.parse(readFileSync(path.join(RAIZ, 'src/estilos/significados.json'), 'utf8')),
});

if (problemas.length === 0) {
  console.log('Auditoría de color: OK (R1–R7). Cada color tiene un significado y se usa solo donde ese significado lo permite.');
  process.exit(0);
}
for (const p of problemas) console.error(`${p.regla}  ${p.archivo}${p.linea ? `:${String(p.linea)}` : ''}  ${p.mensaje}`);
console.error(`\nAuditoría de color: ${String(problemas.length)} problema(s).`);
process.exit(1);
