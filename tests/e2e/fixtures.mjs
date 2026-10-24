// Base de todas las pruebas de punta a punta: el API NUNCA es el real. Por defecto cada /api/** responde
// "sin sesión" (401), así una prueba no cambia de resultado si en la máquina hay un backend corriendo en
// 127.0.0.1:4200. Cada prueba que necesita el API registra sus propias respuestas (Playwright usa la
// ruta registrada más recientemente).
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test as base } from '@playwright/test';

export { expect };

/** @param {string} codigo @param {string} mensaje */
export const cuerpoError = (codigo, mensaje) => JSON.stringify({ error: { codigo, mensaje, solicitud: 'prueba' } });

/**
 * axe en estado ESTABLE: espera a que termine la animación de entrada de la vista (160 ms). A mitad
 * del fundido el texto tiene opacidad parcial y axe mediría un contraste que nadie ve en reposo.
 * Devuelve las violaciones con el elemento y el motivo, para que un fallo diga qué falló.
 * @param {import('@playwright/test').Page} page
 */
export async function axeEstable(page) {
  // Primero, que la vista ya esté dibujada: navegar solo con el hash vuelve antes de que el router la
  // dibuje, y "no hay animaciones" sería cierto solo porque todavía no empezó la de entrada.
  await page.waitForFunction(() => {
    const raiz = document.getElementById('contenido');
    return Boolean(raiz?.querySelector(':scope > .vista')) && !raiz?.hasAttribute('aria-busy');
  });
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} → ${n.failureSummary ?? ''}`).join(' | ')}`);
}

/**
 * Junta las violaciones de la CSP (bloque R) de la página, en todas sus navegaciones. El build lleva la CSP
 * en una <meta>; una prueba con alguna violación falla al terminar, y el mensaje dice cuál.
 * @param {import('@playwright/test').Page} page
 */
export async function vigilarCsp(page) {
  /** @type {string[]} */
  const violaciones = [];
  await page.exposeBinding('__violacionCsp', (_fuente, /** @type {string} */ v) => {
    violaciones.push(v);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      /** @type {any} */ (window).__violacionCsp(`${e.effectiveDirective} ← ${e.blockedURI || '(en línea)'} en ${e.sourceFile || '?'}:${String(e.lineNumber)} «${e.sample}»`);
    });
  });
  return violaciones;
}

export const test = base.extend({
  page: async ({ page }, usar) => {
    await page.route('**/api/**', (r) =>
      r.fulfill({ status: 401, contentType: 'application/json', body: cuerpoError('sin_refresco', 'Inicia sesión de nuevo') }),
    );
    const violaciones = await vigilarCsp(page);
    await usar(page);
    expect(violaciones, 'violaciones de la CSP').toEqual([]);
  },
});
