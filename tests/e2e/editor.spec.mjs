// Bloques L y M de punta a punta: dos personas editan el MISMO documento a la vez, y sin conexión. El API y
// el WebSocket son simulados (el relevo que hace de servidor está en colaboracion.mjs). Las esperas de red
// se registran ANTES de la acción. Datos SOLO ficticios (@example.com, nombres inventados).
import { ANA, BETO, DOC, abrirEditor, red, relevo, segundaPersona, texto } from './colaboracion.mjs';
import { axeEstable, cuerpoError, expect, test } from './fixtures.mjs';

/** @typedef {import('@playwright/test').Page} Page */

test('dos personas editan a la vez: el mismo texto, los cursores con nombre, deshacer lo propio, Tab y sangría', async ({ page, browser, baseURL }) => {
  const servidor = relevo();
  const { contexto: contextoB, pagina: pageB } = await segundaPersona(browser, baseURL, 'light');
  try {
    const a = await abrirEditor(page, ANA, servidor);
    const b = await abrirEditor(pageB, BETO, servidor);
    // El ticket va en el subprotocolo, nunca en la URL.
    expect(a.tickets).toEqual([{ documentoId: DOC }]);
    expect(new URL(a.sockets[0]?.url() ?? '').search).toBe('');

    // Una línea de Ana; Beto la recibe.
    await a.editor.click();
    await page.keyboard.type('Base común');
    await expect.poll(() => texto(pageB)).toBe('Base común');
    // El Y.UndoManager junta en un solo paso lo escrito con menos de 500 ms entre medio: se espera más,
    // para que "deshacer" de abajo quite solo lo que Ana escribe a la vez que Beto.
    await page.waitForTimeout(600);

    // A la vez: Ana al principio y Beto al final.
    await page.keyboard.press('Control+Home');
    await b.editor.click();
    await pageB.keyboard.press('Control+End');
    await Promise.all([page.keyboard.type('Ana escribe. '), pageB.keyboard.type(' Beto escribe.')]);
    const esperado = 'Ana escribe. Base común Beto escribe.';
    await expect.poll(() => texto(page)).toBe(esperado);
    await expect.poll(() => texto(pageB)).toBe(esperado);
    expect(servidor.doc.getText('contenido').toString()).toBe(esperado);

    // Cada una ve el cursor de la otra con su NOMBRE como texto, y quién está.
    await expect(page.locator('.cm-ySelectionInfo', { hasText: BETO.nombre })).toBeVisible();
    await expect(pageB.locator('.cm-ySelectionInfo', { hasText: ANA.nombre })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Aquí ahora' })).toContainText(`${ANA.nombre} (tú)`);
    await expect(page.getByRole('region', { name: 'Aquí ahora' })).toContainText(BETO.nombre);

    // Deshacer solo lo propio: Ana deshace lo último suyo; lo de Beto queda.
    await page.keyboard.press('Control+z');
    await expect.poll(() => texto(pageB)).toBe('Base común Beto escribe.');

    // Ctrl+] indenta (y llega a Beto); Tab sale del editor.
    await page.keyboard.press('Control+BracketRight');
    await expect.poll(() => texto(pageB)).toBe('  Base común Beto escribe.');
    // Tab sale del editor: al siguiente control de la página (desde N, el campo de comentar).
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Comentar la selección')).toBeFocused();

    // Estado de red visible: el servidor corta a Beto; Beto lo ve, reconecta con un ticket nuevo y sigue.
    const ticketNuevo = pageB.waitForRequest('**/api/tiempo-real/tickets');
    await b.sockets[0]?.close({ code: 1013, reason: 'prueba' });
    await expect(red(pageB)).toContainText('Reintentando');
    await ticketNuevo;
    await expect(red(pageB)).toContainText('Conectado');
    expect(b.sockets).toHaveLength(2);
    await expect.poll(() => texto(pageB)).toBe('  Base común Beto escribe.');
  } finally {
    await contextoB.close();
  }
});

// ─── Accesibilidad con cursores y selecciones ajenas a la vista ──────────────────

for (const esquema of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`axe en el editor con cursores remotos, tema ${esquema === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: esquema });

    test('cursor y selección de otra persona, con su nombre', async ({ page, browser, baseURL }) => {
      const servidor = relevo();
      const { contexto: contextoB, pagina: pageB } = await segundaPersona(browser, baseURL, esquema);
      try {
        const a = await abrirEditor(page, ANA, servidor);
        const b = await abrirEditor(pageB, BETO, servidor);
        await a.editor.click();
        await page.keyboard.type('Texto que Beto selecciona.');
        await expect.poll(() => texto(pageB)).toBe('Texto que Beto selecciona.');
        await b.editor.click();
        await pageB.keyboard.press('Control+End');
        await pageB.keyboard.press('Shift+Home');
        const etiqueta = page.locator('.cm-ySelectionInfo', { hasText: BETO.nombre });
        await expect(etiqueta).toBeVisible();
        await expect(page.locator('.cm-ySelection').first()).toBeVisible();
        // El color dibujado es el token (nunca un valor que mande otro cliente).
        await expect(etiqueta.locator('xpath=..')).toHaveAttribute('style', /var\(--color-presencia-[1-6]\)/);
        expect(await axeEstable(page)).toEqual([]);
      } finally {
        await contextoB.close();
      }
    });
  });
}

// ─── Sin conexión (bloque M) ───────────────────────────────────────────────────────

/** Filas de la copia local del navegador (IndexedDB "cuaderno-local"). */
const filasEnLaCopia = (/** @type {Page} */ page) =>
  page.evaluate(
    () =>
      new Promise((resolver) => {
        const pedido = indexedDB.open('cuaderno-local');
        pedido.onsuccess = () => {
          const cuenta = pedido.result.transaction('cambios').objectStore('cambios').count();
          cuenta.onsuccess = () => {
            pedido.result.close();
            resolver(cuenta.result);
          };
        };
      }),
  );

test('sin red: Ana sigue escribiendo, cierra la página, vuelve con red y todo llega una sola vez; salir borra la copia', async ({ page, browser, baseURL }) => {
  const servidor = relevo();
  const { contexto: contextoB, pagina: pageB } = await segundaPersona(browser, baseURL, 'light');
  const conexionAna = { sinRed: false };
  try {
    const a = await abrirEditor(page, ANA, servidor, conexionAna);
    const b = await abrirEditor(pageB, BETO, servidor);
    await a.editor.click();
    await page.keyboard.type('Base');
    await expect.poll(() => texto(pageB)).toBe('Base');

    // Ana se queda sin red: la conexión se cae y los tickets fallan.
    conexionAna.sinRed = true;
    await page.context().setOffline(true);
    await a.sockets.at(-1)?.close({ code: 1001, reason: 'sin red' });
    await expect(red(page)).toContainText('Sin conexión');
    await page.keyboard.press('Control+End');
    const filasAntes = await filasEnLaCopia(page);
    await page.keyboard.type(' sin red');
    await expect(red(page)).toContainText('Hay cambios sin enviar, guardados en este dispositivo');
    // Beto, en línea, escribe a la vez; a Ana no le llega (ni a Beto lo de Ana).
    await b.editor.click();
    await pageB.keyboard.press('Control+Home');
    await pageB.keyboard.type('Beto: ');
    await expect.poll(() => texto(pageB)).toBe('Beto: Base');
    await expect.poll(() => texto(page)).toBe('Base sin red');

    // Ana cierra la página SIN red (lo escrito queda en IndexedDB) y la abre de nuevo con red.
    // La escritura en IndexedDB es asíncrona: se espera a que esté cada tecla escrita sin red (una
    // actualización de Yjs por tecla, una fila por actualización).
    await expect.poll(() => filasEnLaCopia(page)).toBeGreaterThanOrEqual(filasAntes + ' sin red'.length);
    const contextoA = page.context();
    await page.close();
    await contextoA.setOffline(false);
    conexionAna.sinRed = false;
    const page2 = await contextoA.newPage();
    await page2.route('**/api/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: cuerpoError('sin_refresco', 'Inicia sesión de nuevo') }));
    const a2 = await abrirEditor(page2, ANA, servidor, conexionAna);
    const esperado = 'Beto: Base sin red';
    await expect.poll(() => texto(page2)).toBe(esperado);
    await expect.poll(() => texto(pageB)).toBe(esperado);
    expect(servidor.doc.getText('contenido').toString()).toBe(esperado);
    await expect(red(page2)).not.toContainText('cambios sin enviar');
    expect(a2.tickets).toHaveLength(1);

    // Salir borra la copia local del dispositivo.
    const bases = () => page2.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    expect(await bases()).toContain('cuaderno-local');
    await page2.route('**/api/auth/sesion', (r) => r.fulfill({ status: 204 }));
    await page2.getByRole('button', { name: 'Salir' }).click();
    await expect(page2).toHaveURL(/#\/$/);
    await expect.poll(bases).not.toContain('cuaderno-local');
  } finally {
    await contextoB.close();
  }
});

test('salir con cambios sin enviar avisa cuántos; cancelar los conserva y confirmar los borra', async ({ page }) => {
  const servidor = relevo();
  const conexionAna = { sinRed: false };
  const a = await abrirEditor(page, ANA, servidor, conexionAna);
  await a.editor.click();
  await page.keyboard.type('Base');
  await expect.poll(() => servidor.doc.getText('contenido').toString()).toBe('Base');

  conexionAna.sinRed = true;
  await page.context().setOffline(true);
  await a.sockets.at(-1)?.close({ code: 1001, reason: 'sin red' });
  await expect(red(page)).toContainText('Sin conexión');
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' uno');
  await expect(red(page)).toContainText('Hay cambios sin enviar');
  const bases = () => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));

  // Cancelar: no sale, la copia sigue.
  await page.getByRole('button', { name: 'Salir' }).click();
  const dialogo = page.getByRole('alertdialog', { name: 'Tienes 4 cambios sin enviar (en 1 documento)' });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(page).toHaveURL(/editar$/);
  expect(await bases()).toContain('cuaderno-local');

  // Escape también cancela.
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(dialogo).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  expect(await bases()).toContain('cuaderno-local');

  // Confirmar: sale y borra la copia (con esos cambios).
  await page.getByRole('button', { name: 'Salir' }).click();
  await dialogo.getByRole('button', { name: 'Salir y borrar esos cambios' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect.poll(bases).not.toContain('cuaderno-local');
});
