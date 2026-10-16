// Contraste AA (WCAG 2.x) de cada par de significados.json, en los temas claro y oscuro.
// Texto: 4.5:1. Componentes de interfaz, bordes de controles, íconos y foco: 3:1. Sin redondeos: 4.49 no
// cumple 4.5. Sale con 1 si algún par no cumple.
// Uso: node scripts/contraste.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { medirPares } from './lib/contraste.mjs';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readFileSync(path.join(RAIZ, 'src/estilos/tokens.css'), 'utf8');
/** @type {{ pares: import('./lib/contraste.mjs').Par[] }} */
const registro = JSON.parse(readFileSync(path.join(RAIZ, 'src/estilos/significados.json'), 'utf8'));

const medidas = medirPares(tokens, registro.pares);
for (const m of medidas) {
  const marca = m.cumple ? 'OK   ' : 'FALLA';
  console.log(`${marca} ${m.tema.padEnd(6)} ${m.texto.padEnd(24)} sobre ${m.fondo.padEnd(22)} ${m.razon.toFixed(2).padStart(5)}:1 (mínimo ${String(m.minimo)}:1)`);
}
const fallas = medidas.filter((m) => !m.cumple);
console.log(`\nContraste AA: ${String(medidas.length - fallas.length)} de ${String(medidas.length)} pares cumplen.`);
process.exit(fallas.length === 0 ? 0 : 1);
