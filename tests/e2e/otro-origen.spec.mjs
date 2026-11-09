// El frontend y el API en ORÍGENES DISTINTOS, como en producción (cuaderno.<dominio> → api-cuaderno.<dominio>).
// Aquí la página está en http://127.0.0.1:5175 y el build apunta a VITE_API_URL (por defecto
// http://127.0.0.1:4200, simulado): toda petición /api va a ese origen y ninguna al de la página, la CSP lo
// permite (la fixture falla ante cualquier violación) y el Service Worker no intercepta ninguna.
import { origenApiDelBuild } from '../../scripts/lib/csp.mjs';
import { expect, test } from './fixtures.mjs';

const ORIGEN_API = origenApiDelBuild(process.env.VITE_API_URL);

test('las llamadas al API van a su propio origen, nunca al de la página', async ({ page, baseURL }) => {
  const origenPagina = new URL(baseURL ?? 'http://127.0.0.1:5175').origin;
  expect(ORIGEN_API, 'el E2E tiene que correr con el API en otro origen').not.toBe(origenPagina);
  /** @type {string[]} */
  const alApi = [];
  /** @type {string[]} */
  const alaPagina = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith('/api/')) return;
    (url.origin === ORIGEN_API ? alApi : alaPagina).push(`${r.method()} ${url.pathname}`);
  });
  await page.goto('/#/cuenta');
  // Sin cookie válida (la fixture responde 401): la app pide el refresco al API y manda a Entrar.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => alApi).toContain('POST /api/auth/refresco');
  expect(alaPagina, 'ninguna petición /api al origen de la página').toEqual([]);
});
