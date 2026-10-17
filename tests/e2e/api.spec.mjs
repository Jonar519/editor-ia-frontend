// Cliente del API y componentes de estado de punta a punta, con el API SIMULADO (page.route): sesión
// recuperada con la cookie, token solo en memoria, "Reintentar" que repite la petición sin recargar,
// límites (429) y fin de sesión. Cada espera de red se registra ANTES de la acción que la dispara.
import { axeEstable, cuerpoError, expect, test } from './fixtures.mjs';

const TOKEN = 'token-de-prueba-que-no-debe-guardarse';
const SESION = {
  accessToken: TOKEN,
  expiraEn: Math.floor(Date.now() / 1000) + 900,
  usuario: { id: '00000000-0000-4000-8000-000000000001', nombre: 'Ana Ficticia', correo: 'ana@example.com', rol: 'lector' },
};
const PERFIL = { ...SESION.usuario, telefono: null, mfaActivo: false, creadaEn: '2026-01-01T00:00:00.000Z', activadaEn: null, avatar: null, cambioCorreoPendiente: null };

/** Simula una sesión válida: el refresco con la cookie devuelve un access token. */
async function conSesion(/** @type {import('@playwright/test').Page} */ page) {
  await page.route('**/api/auth/refresco', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESION) }));
}

test('al abrir la página la sesión se recupera con la cookie y la cuenta se carga con el token en la cabecera', async ({ page }) => {
  await conSesion(page);
  await page.route('**/api/cuenta', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PERFIL) }));
  const pedidoCuenta = page.waitForRequest('**/api/cuenta');
  await page.goto('/#/cuenta');
  const pedido = await pedidoCuenta;
  expect(pedido.headers().authorization).toBe(`Bearer ${TOKEN}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Tu cuenta' })).toBeFocused();
  await expect(page.getByText('ana@example.com')).toBeVisible();
  await expect(page.getByText('Lectura')).toBeVisible();
});

test('el access token NO queda en localStorage, sessionStorage, IndexedDB, cookies de JS ni en la URL', async ({ page, context }) => {
  await conSesion(page);
  await page.route('**/api/cuenta', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PERFIL) }));
  await page.goto('/#/cuenta');
  await expect(page.getByText('ana@example.com')).toBeVisible();
  const guardado = await page.evaluate(async () => {
    const bases = 'databases' in indexedDB ? await indexedDB.databases() : [];
    return {
      local: JSON.stringify({ ...localStorage }),
      sesion: JSON.stringify({ ...sessionStorage }),
      cookies: document.cookie,
      bases: bases.length,
      url: location.href,
    };
  });
  expect(JSON.stringify(guardado)).not.toContain(TOKEN);
  expect(guardado.bases).toBe(0);
  expect(JSON.stringify(await context.cookies())).not.toContain(TOKEN);
});

test('sin sesión (la cookie no sirve), una sección protegida manda a Entrar', async ({ page }) => {
  // La respuesta por defecto de fixtures.mjs: 401 en /api/**.
  await page.goto('/#/cuenta');
  await expect(page).toHaveURL(/#\/entrar$/);
});

test('error al cargar: se dice qué falló y "Reintentar" repite la PETICIÓN sin recargar la página', async ({ page }) => {
  await conSesion(page);
  let intentos = 0;
  await page.route('**/api/cuenta', (r) => {
    intentos++;
    return intentos === 1
      ? r.fulfill({ status: 503, contentType: 'application/json', body: cuerpoError('no_disponible', 'No disponible') })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PERFIL) });
  });
  await page.goto('/#/cuenta');
  await expect(page.getByRole('alert')).toContainText('Error: No se pudo cargar tu perfil. El servidor tuvo un problema.');
  // Marca en la página: si "Reintentar" recargara, se perdería.
  await page.evaluate(() => {
    /** @type {any} */ (window).marcaDePrueba = 'sigue';
  });
  const segundo = page.waitForRequest('**/api/cuenta');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await segundo;
  await expect(page.getByText('ana@example.com')).toBeVisible();
  expect(await page.evaluate(() => /** @type {any} */ (window).marcaDePrueba)).toBe('sigue');
  expect(intentos).toBe(2);
});

test('sin red: el mensaje lo dice con claridad', async ({ page }) => {
  await conSesion(page);
  await page.route('**/api/cuenta', (r) => r.abort('internetdisconnected'));
  await page.goto('/#/cuenta');
  await expect(page.getByRole('alert')).toContainText('No hay conexión con el servidor.');
});

test('límite de intentos (429 con Retry-After): dice cuánto esperar', async ({ page }) => {
  await conSesion(page);
  await page.route('**/api/cuenta', (r) =>
    r.fulfill({ status: 429, contentType: 'application/json', headers: { 'retry-after': '30' }, body: cuerpoError('limite', 'Demasiadas solicitudes.') }),
  );
  await page.goto('/#/cuenta');
  await expect(page.getByRole('alert')).toContainText('Demasiadas solicitudes. Puedes volver a intentar en 30 s.');
});

test('si la sesión termina (401 y el refresco ya no sirve), se olvida y la vista manda a Entrar', async ({ page }) => {
  let refrescos = 0;
  await page.route('**/api/auth/refresco', (r) => {
    refrescos++;
    return refrescos === 1
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESION) })
      : r.fulfill({ status: 401, contentType: 'application/json', body: cuerpoError('refresco_invalido', 'Inicia sesión de nuevo') });
  });
  await page.route('**/api/cuenta', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: cuerpoError('no_autenticado', 'Inicia sesión de nuevo') }));
  await page.goto('/#/cuenta');
  await expect(page).toHaveURL(/#\/entrar$/);
  expect(refrescos).toBe(2); // el de la carga y UNO tras el 401 (sin bucle)
});

for (const esquema of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`axe en los estados de "Tu cuenta", tema ${esquema === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: esquema });

    test('con datos y con error', async ({ page }) => {
      await conSesion(page);
      let fallar = false;
      await page.route('**/api/cuenta', (r) =>
        fallar
          ? r.fulfill({ status: 500, contentType: 'application/json', body: cuerpoError('interno', 'Error interno') })
          : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PERFIL) }),
      );
      await page.goto('/#/cuenta');
      await expect(page.getByText('ana@example.com')).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);
      fallar = true;
      await page.reload();
      await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);
    });
  });
}

test('fuentes autoalojadas: se sirven del mismo origen y la del texto se usa', async ({ page }) => {
  /** @type {string[]} */
  const fuentes = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fuentes.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Cuaderno' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(fuentes.length).toBeGreaterThan(0);
  for (const f of fuentes) expect(f.startsWith('http://127.0.0.1:5175/assets/')).toBe(true);
  const usada = await page.evaluate(() => document.fonts.check('16px "Atkinson Hyperlegible Next Variable"'));
  expect(usada).toBe(true);
});
