// Bloque O de punta a punta (API y WebSocket simulados, colaboracion.mjs): la batería XSS sobre el DOM
// REAL de la vista renderizada (si algo se ejecutara, pondría una marca en window), la estructura (tablas,
// tareas, resaltado) en vivo, y en el editor los atajos, el menú "/", la paleta Ctrl+K y la vista previa,
// con axe en los dos temas. Datos SOLO ficticios.
import { ANA, LUCIA, abrirDocumento, relevo, texto } from './colaboracion.mjs';
import { axeEstable, expect, test } from './fixtures.mjs';

/** @typedef {import('@playwright/test').Page} Page */

const CARGAS = [
  '<script>window.__xss = 1</script>',
  '<img src=x onerror="window.__xss = 2">',
  '<svg onload="window.__xss = 3"></svg>',
  '<iframe srcdoc="<script>parent.__xss = 4</script>"></iframe>',
  '<a href="javascript:window.__xss = 5">a</a>',
  '<details open ontoggle="window.__xss = 6">d</details>',
  '[enlace](javascript:window.__xss=7)',
  '[enlace](java&#x73;cript:window.__xss=8)',
  '<javascript:window.__xss=9>',
  '![x](javascript:window.__xss=10)',
  '[ref][r]\n\n[r]: javascript:window.__xss=11',
  '```js" onmouseover="window.__xss=12\ncodigo\n```',
  '| a | <img src=x onerror="window.__xss=13"> |\n|---|---|\n| 1 | 2 |',
];

/** La vista renderizada de la lectura. */
const renderizada = (/** @type {Page} */ page) => page.getByRole('region', { name: 'Documento Guía de prueba' });

test('batería XSS sobre el DOM real: nada se ejecuta, nada peligroso queda en el DOM y el HTML se ve como texto', async ({ page }) => {
  const servidor = relevo();
  servidor.doc.getText('contenido').insert(0, CARGAS.join('\n\n'));
  await page.addInitScript(() => {
    window.alert = () => {
      /** @type {any} */ (window).__xss = 'alert';
    };
  });
  await abrirDocumento(page, LUCIA, servidor, { vista: 'leer', rol: 'lector' });
  const vista = renderizada(page);
  await expect(vista).toContainText('<script>window.__xss = 1</script>');
  // Dar tiempo a que algo "se ejecute" (onerror, onload, ontoggle).
  await page.waitForTimeout(500);
  const resultado = await vista.evaluate((el) => ({
    xss: /** @type {any} */ (window).__xss ?? null,
    prohibidos: [...el.querySelectorAll('script, img, iframe, svg, style, math, object, embed, details, frame, link, meta, base, form')].map((x) => x.tagName),
    conOn: [...el.querySelectorAll('*')].flatMap((x) => [...x.attributes].filter((a) => /^on/i.test(a.name)).map((a) => `${x.tagName}[${a.name}]`)),
    enlaces: [...el.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
  }));
  expect(resultado.xss).toBeNull();
  expect(resultado.prohibidos).toEqual([]);
  expect(resultado.conOn).toEqual([]);
  for (const href of resultado.enlaces) expect(href).toMatch(/^(https?:|mailto:|#)/);
});

test('vista renderizada en vivo: títulos, tareas, tabla con encabezados, código resaltado; axe en los dos temas', async ({ page, browser, baseURL }) => {
  const servidor = relevo();
  servidor.doc
    .getText('contenido')
    .insert(0, '# Guía\n\n- [x] hecho\n- [ ] pendiente\n\n| Nombre | Valor |\n|:--|--:|\n| uno | 1 |\n\n```js\nconst x = 1; // nota\n```\n\nTexto con **negrita** y [enlace](https://example.com).');
  await abrirDocumento(page, LUCIA, servidor, { vista: 'leer', rol: 'lector' });
  const vista = renderizada(page);
  await expect(vista.getByRole('heading', { level: 1, name: 'Guía' })).toBeVisible();
  await expect(vista.getByRole('checkbox', { name: 'Tarea hecha' })).toBeChecked();
  await expect(vista.getByRole('checkbox', { name: 'Tarea pendiente' })).not.toBeChecked();
  await expect(vista.getByRole('columnheader')).toHaveText(['Nombre', 'Valor']);
  await expect(vista.locator('code.hljs .hljs-keyword')).toHaveText('const'); // resaltado bajo demanda
  await expect(vista.getByRole('link', { name: 'enlace' })).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
  // En vivo: lo que se escribe en el documento aparece renderizado.
  servidor.doc.getText('contenido').insert(0, '## Nuevo\n\n');
  await expect(vista.getByRole('heading', { level: 2, name: 'Nuevo' })).toBeVisible();
  expect(await axeEstable(page)).toEqual([]);

  const contexto = await browser.newContext({ baseURL, locale: 'es-MX', timezoneId: 'UTC', colorScheme: 'dark', serviceWorkers: 'block' });
  try {
    const oscura = await contexto.newPage();
    await oscura.route('**/api/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await abrirDocumento(oscura, LUCIA, servidor, { vista: 'leer', rol: 'lector' });
    await expect(renderizada(oscura).locator('code.hljs .hljs-keyword')).toHaveText('const');
    expect(await axeEstable(oscura)).toEqual([]);
  } finally {
    await contexto.close();
  }
});

test('editor: Ctrl+B, Enter continúa la lista, menú "/", paleta Ctrl+K con el teclado y vista previa', async ({ page }) => {
  const servidor = relevo();
  const a = await abrirDocumento(page, ANA, servidor, { rol: 'propietario' });
  await a.editor.click();

  // Atajo: negrita sobre lo seleccionado.
  await page.keyboard.type('hola mundo');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+b');
  await expect.poll(() => texto(page)).toBe('hola **mundo**');

  // Enter continúa la lista.
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- uno');
  await page.keyboard.press('Enter');
  await page.keyboard.type('dos');
  await expect.poll(() => texto(page)).toBe('hola **mundo**\n- uno\n- dos');

  // Menú "/": filtrar y elegir con el teclado.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter'); // sale de la lista
  await page.keyboard.type('/tab');
  const menu = page.getByRole('listbox');
  await expect(menu.getByRole('option')).toHaveText(['Tabla']);
  expect(await axeEstable(page)).toEqual([]);
  await page.keyboard.press('Enter');
  await expect.poll(() => servidor.doc.getText('contenido').toString()).toContain('| Columna | Columna |\n| --- | --- |');

  // Paleta Ctrl+K: buscar, elegir con flechas y Enter; al cerrar, el foco vuelve al editor.
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+k');
  const paleta = page.getByRole('dialog', { name: 'Comandos' });
  await expect(paleta).toBeVisible();
  await expect(paleta.getByRole('combobox')).toBeFocused();
  await page.keyboard.type('titulo');
  await expect(paleta.getByRole('option')).toHaveText(['Título 1', 'Título 2', 'Título 3']);
  expect(await axeEstable(page)).toEqual([]);
  await page.keyboard.press('ArrowDown');
  await expect(paleta.getByRole('option', { name: 'Título 2' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(paleta).toHaveCount(0);
  await expect.poll(() => texto(page)).toMatch(/^## hola \*\*mundo\*\*/);
  await expect(page.locator('.cm-content')).toBeFocused();
  // Escape cierra sin hacer nada.
  await page.keyboard.press('Control+k');
  await expect(paleta).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paleta).toHaveCount(0);
  await expect(page.locator('.cm-content')).toBeFocused();

  // Vista previa.
  await page.getByRole('button', { name: 'Vista previa' }).click();
  const previa = page.getByRole('region', { name: 'Vista previa de Guía de prueba' });
  await expect(previa.getByRole('heading', { level: 2 })).toHaveText('hola mundo');
  await expect(previa.getByRole('table')).toBeVisible();
});
