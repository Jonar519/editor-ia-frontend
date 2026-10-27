// La CSP del build (bloque R). Todas las demás pruebas fallan si hay alguna violación (fixtures.mjs); esta
// comprueba que la política servida es la de scripts/lib/csp.mjs, que de verdad bloquea un script en línea
// y que el colector de violaciones lo ve. Usa el `test` de Playwright, no el de la fixture: aquí la
// violación es a propósito.
import { expect, test } from '@playwright/test';
import { CSP } from '../../scripts/lib/csp.mjs';
import { cuerpoError, vigilarCsp } from './fixtures.mjs';

test('el build sirve la CSP, bloquea un script en línea y el colector de violaciones lo registra', async ({ page }) => {
  await page.route('**/api/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: cuerpoError('sin_refresco', 'Inicia sesión de nuevo') }));
  const violaciones = await vigilarCsp(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Cuaderno' })).toBeVisible();
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toBe(CSP);
  expect(violaciones).toEqual([]);

  // Un <script> en línea (como el que inyectaría un XSS): no corre, y queda registrado.
  await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__inyectado = true;';
    document.body.append(s);
  });
  await expect.poll(() => violaciones.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => /** @type {any} */ (window).__inyectado)).toBeUndefined();
  expect(violaciones[0]).toMatch(/^script-src-elem ← inline /);
});
