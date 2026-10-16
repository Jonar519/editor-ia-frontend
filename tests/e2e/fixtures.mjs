// Base de todas las pruebas de punta a punta: el API NUNCA es el real. Por defecto cada /api/** responde
// "sin sesión" (401), así una prueba no cambia de resultado si en la máquina hay un backend corriendo en
// 127.0.0.1:4200. Cada prueba que necesita el API registra sus propias respuestas (Playwright usa la
// ruta registrada más recientemente).
import { AxeBuilder } from '@axe-core/playwright';
import { test as base } from '@playwright/test';

export { expect } from '@playwright/test';

/** @param {string} codigo @param {string} mensaje */
export const cuerpoError = (codigo, mensaje) => JSON.stringify({ error: { codigo, mensaje, solicitud: 'prueba' } });

/**
 * axe en estado ESTABLE: espera a que termine la animación de entrada de la vista (160 ms). A mitad
 * del fundido el texto tiene opacidad parcial y axe mediría un contraste que nadie ve en reposo.
 * Devuelve las violaciones con el elemento y el motivo, para que un fallo diga qué falló.
 * @param {import('@playwright/test').Page} page
 */
export async function axeEstable(page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} → ${n.failureSummary ?? ''}`).join(' | ')}`);
}

export const test = base.extend({
  page: async ({ page }, usar) => {
    await page.route('**/api/**', (r) =>
      r.fulfill({ status: 401, contentType: 'application/json', body: cuerpoError('sin_refresco', 'Inicia sesión de nuevo') }),
    );
    await usar(page);
  },
});
