// Esqueleto de punta a punta sobre el build (vite preview). Los colores esperados se calculan desde
// tokens.css, no se copian: si cambia un token, la prueba sigue siendo válida.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hexARgb, resolver, temas } from '../../scripts/lib/contraste.mjs';
import { axeEstable, expect, test } from './fixtures.mjs';

const tokens = temas(readFileSync(path.join(import.meta.dirname, '../../src/estilos/tokens.css'), 'utf8'));
const rgb = (/** @type {string} */ hex) => `rgb(${hexARgb(hex).join(', ')})`;
const FONDO = { light: rgb(resolver('--color-fondo', tokens.claro)), dark: rgb(resolver('--color-fondo', tokens.oscuro)) };
const TEXTO = { light: rgb(resolver('--color-texto', tokens.claro)), dark: rgb(resolver('--color-texto', tokens.oscuro)) };

test('inicio: título, foco en el h1 y título del documento', async ({ page }) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1, name: 'Cuaderno' });
  await expect(h1).toBeVisible();
  await expect(h1).toBeFocused();
  await expect(page).toHaveTitle('Inicio · Cuaderno');
  await expect(page.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
});

test('sin sesión, una sección protegida manda a Entrar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Documentos' }).click();
  await expect(page).toHaveURL(/#\/entrar$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeFocused();
  await page.goto('/#/admin');
  await expect(page).toHaveURL(/#\/entrar$/);
});

test('una dirección que no existe: "Página no encontrada" con el foco en el título', async ({ page }) => {
  await page.goto('/#/no-existe');
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeFocused();
  await expect(page).toHaveTitle('Página no encontrada · Cuaderno');
});

test('saltar al contenido: es lo primero que se enfoca, aparece al enfocarlo y no cambia de vista', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  const primero = await page.evaluate(() => document.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')?.textContent);
  expect(primero).toBe('Saltar al contenido');
  const saltar = page.getByRole('link', { name: 'Saltar al contenido' });
  await expect(saltar).not.toBeInViewport();
  await saltar.focus();
  await expect(saltar).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenido')).toBeFocused();
  await expect(page.getByRole('heading', { level: 1, name: 'Cuaderno' })).toBeVisible();
});

test('estado de error: si la vista no carga, se dice y se puede reintentar', async ({ page }) => {
  await page.goto('/');
  // La espera de red se registra ANTES de la acción que la dispara.
  await page.route('**/assets/entrar-*.js', (r) => r.abort());
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'No se pudo cargar' })).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Error:');
  await page.unroute('**/assets/entrar-*.js');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible();
});

for (const esquema of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`tema ${esquema === 'light' ? 'claro' : 'oscuro'} (lo decide el sistema)`, () => {
    test.use({ colorScheme: esquema });

    test('los colores salen de los tokens de ese tema', async ({ page }) => {
      await page.goto('/');
      const body = page.locator('body');
      await expect(body).toHaveCSS('background-color', FONDO[esquema]);
      await expect(body).toHaveCSS('color', TEXTO[esquema]);
    });

    for (const ruta of ['/', '/#/entrar', '/#/no-existe']) {
      test(`axe sin violaciones WCAG 2.1 A/AA en ${ruta}`, async ({ page }) => {
        await page.goto(ruta);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await axeEstable(page)).toEqual([]);
      });
    }
  });
}

test.describe('movimiento', () => {
  test('con reducción de movimiento no hay animación', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.vista')).toHaveCSS('animation-name', 'none');
  });

  test('sin preferencia, la única animación es "aparecer"', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await expect(page.locator('.vista')).toHaveCSS('animation-name', 'aparecer');
  });
});
