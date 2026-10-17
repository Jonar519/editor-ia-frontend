// Service Worker de verdad (aquí no se bloquea): se registra, la app abre sin red con el armazón
// precargado, y nada de /api queda en la caché.
import { expect, test } from './fixtures.mjs';

test.use({ serviceWorkers: 'allow' });

/** Espera a que el Service Worker esté activo y controle la página. */
async function swListo(/** @type {import('@playwright/test').Page} */ page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((listo) => navigator.serviceWorker.addEventListener('controllerchange', () => listo(undefined), { once: true }));
    }
  });
}

/** Rutas de todo lo que hay en las cachés de la página. */
function clavesEnCache(/** @type {import('@playwright/test').Page} */ page) {
  return page.evaluate(async () => {
    const todas = [];
    for (const n of await caches.keys()) for (const req of await (await caches.open(n)).keys()) todas.push(new URL(req.url).pathname);
    return todas;
  });
}

test('se registra y, sin red, la aplicación abre con el armazón precargado', async ({ page, context, browserName }) => {
  // En Firefox, el modo sin red de Playwright corta la navegación antes de que el SW pueda responderla
  // (NS_ERROR_OFFLINE): es una limitación de la emulación, no del SW. El resto de las pruebas del SW sí
  // corren en Firefox.
  test.skip(browserName === 'firefox', 'Playwright + Firefox: setOffline no deja al SW responder navegaciones');
  await page.goto('/');
  await swListo(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Cuaderno' })).toBeVisible();
    await expect(page).toHaveTitle('Inicio · Cuaderno');
  } finally {
    await context.setOffline(false);
  }
});

test('/api nunca se cachea: sin red, una petición al API falla (no la responde la caché)', async ({ page, context, browserName }) => {
  await page.goto('/');
  await swListo(page);
  // Sin el API simulado: page.route respondería aunque no haya red y la prueba no probaría nada. La
  // petición va a la red de verdad (el estado HTTP no importa; importa que no quede en la caché).
  await page.unroute('**/api/**');
  // Una petición al API con el SW controlando la página: la responde la RED, no el SW.
  const respuesta = page.waitForResponse('**/api/auth/yo');
  await page.evaluate(() => fetch('/api/auth/yo').then((r) => r.status));
  expect((await respuesta).fromServiceWorker()).toBe(false);
  const claves = await clavesEnCache(page);
  expect(claves.length).toBeGreaterThan(0); // control: la caché sí tiene el armazón
  expect(claves.filter((c) => c.startsWith('/api'))).toEqual([]);
  // Sin red, el API no tiene respuesta guardada. En Firefox, el modo sin red de Playwright no corta las
  // peticiones que el SW deja pasar (llegan a la red igual): esa parte se comprueba en Chromium.
  if (browserName === 'firefox') return;
  await context.setOffline(true);
  try {
    const resultado = await page.evaluate(() =>
      fetch('/api/auth/yo').then(
        (r) => `respuesta ${String(r.status)}`,
        () => 'sin respuesta',
      ),
    );
    expect(resultado).toBe('sin respuesta');
  } finally {
    await context.setOffline(false);
  }
});

test('precarga solo el armazón: el código del editor y de administración no se descarga de antemano', async ({ page }) => {
  await page.goto('/');
  await swListo(page);
  const claves = await clavesEnCache(page);
  expect(claves.some((c) => /\/assets\/inicio-/.test(c))).toBe(true);
  // Nombre EXACTO del chunk (nombre-<hash de 8>.js): "cuenta-eliminada" es pública y SÍ se precarga.
  expect(claves.some((c) => /\/assets\/cuenta-eliminada-[\w-]{8}\.js$/.test(c))).toBe(true);
  const protegidas = /\/assets\/(editar|panel|cuenta|documentos|foto|cambiar-correo|contrasena|dos-pasos|sesiones|datos)-[\w-]{8}\.js$/;
  expect(claves.filter((c) => protegidas.test(c))).toEqual([]);
});
