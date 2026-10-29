// Bloque N de punta a punta, con el API y el WebSocket simulados (colaboracion.mjs): comentarios anclados
// entre una lectora (vista de lectura) y una editora (editor), y el historial de versiones con diferencia y
// restauración. Datos SOLO ficticios.
import { ANA, DOC, LUCIA, abrirDocumento, comentariosSimulados, relevo, segundaPersona, texto, versionesSimuladas } from './colaboracion.mjs';
import { axeEstable, expect, test } from './fixtures.mjs';

/** @typedef {import('@playwright/test').Page} Page */

/** El texto de la lectura (textarea de solo lectura). */
const lectura = (/** @type {Page} */ page) => page.getByRole('textbox', { name: 'Contenido de Guía de prueba' });
const hilos = (/** @type {Page} */ page) => page.getByRole('complementary', { name: 'Comentarios' }).locator('article.hilo');

test('comentarios anclados: una lectora comenta con el teclado, el ancla sigue al texto, responder, borradores, resolver y texto eliminado', async ({ page, browser, baseURL }) => {
  const servidor = relevo();
  const comentarios = comentariosSimulados(servidor);
  const { contexto: contextoL, pagina: pageL } = await segundaPersona(browser, baseURL, 'light');
  try {
    await comentarios.registrar(page, ANA, 'propietario');
    const a = await abrirDocumento(page, ANA, servidor, { rol: 'propietario' });
    await a.editor.click();
    await page.keyboard.type('Introducción al tema');
    // Diagnóstico de una falla vista una vez en el CI (la lectura mostró «ntroducción al temaI») y no
    // reproducida después: si vuelve, esto dice si ya el editor de Ana quedó mal (el cursor saltó al
    // inicio tras la primera tecla) o si fue la sincronía con el servidor o la lectura.
    await expect.poll(() => texto(page)).toBe('Introducción al tema');
    await expect.poll(() => servidor.doc.getText('contenido').toString()).toBe('Introducción al tema');

    await comentarios.registrar(pageL, LUCIA, 'lector');
    await abrirDocumento(pageL, LUCIA, servidor, { vista: 'leer', rol: 'lector' });
    // Desde O, la lectura abre en la vista renderizada; el tramo se elige en el texto fuente.
    await pageL.getByRole('button', { name: 'Ver el texto fuente' }).click();
    await expect(pageL.getByRole('button', { name: 'Ver el texto fuente' })).toHaveAttribute('aria-pressed', 'true');
    await expect(lectura(pageL)).toHaveValue('Introducción al tema');

    // La lectura no se deja editar (escribir, borrar ni pegar no cambia el texto).
    await lectura(pageL).focus();
    await pageL.keyboard.type('zz');
    await pageL.keyboard.press('Backspace');
    await expect(lectura(pageL)).toHaveValue('Introducción al tema');
    expect(servidor.doc.getText('contenido').toString()).toBe('Introducción al tema');

    // Lucía selecciona "tema" con el teclado (Fin y Mayús+← cuatro veces) y comenta.
    await pageL.keyboard.press('End');
    for (let i = 0; i < 4; i++) await pageL.keyboard.press('Shift+ArrowLeft');
    await expect
      .poll(() => lectura(pageL).evaluate((el) => [/** @type {HTMLTextAreaElement} */ (el).selectionStart, /** @type {HTMLTextAreaElement} */ (el).selectionEnd, document.activeElement?.tagName]))
      .toEqual([16, 20, 'TEXTAREA']);
    await expect(pageL.locator('#comentar-ayuda')).toHaveText('Vas a comentar: «tema»');
    await pageL.getByLabel('Comentar la selección').fill('¿Cuál tema?');
    await pageL.getByRole('button', { name: 'Comentar', exact: true }).click();
    await expect(hilos(pageL)).toHaveCount(1);
    expect(comentarios.pedidos[0]?.cuerpo.ancla).toMatch(/^[A-Za-z0-9_-]+$/);

    // A Ana le llega (aviso por el WebSocket): el hilo con la cita y la marca en el editor.
    await expect(hilos(page)).toHaveCount(1);
    await expect(hilos(page).locator('.cita')).toHaveText('«tema»');
    await expect(page.locator('.cm-content .comentado')).toHaveText('tema');

    // Ana escribe antes: el ancla sigue a "tema" en las dos personas.
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('Gran ');
    await expect.poll(() => texto(page)).toBe('Gran Introducción al tema');
    await expect(hilos(pageL).locator('.cita')).toHaveText('«tema»');
    await expect(page.locator('.cm-content .comentado')).toHaveText('tema');
    // "Ir al texto" selecciona el tramo en el editor.
    await hilos(page).getByRole('button', { name: 'Ir al texto' }).click();
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('tema');

    // Lucía empieza una respuesta; mientras escribe, Ana responde: el borrador de Lucía no se pierde.
    await hilos(pageL).getByRole('button', { name: 'Responder' }).click();
    await hilos(pageL).getByLabel('Tu respuesta').fill('borrador de Lucía');
    await hilos(page).getByRole('button', { name: 'Responder' }).click();
    await hilos(page).getByLabel('Tu respuesta').fill('El de la guía');
    await hilos(page).getByRole('button', { name: 'Responder', exact: true }).last().click();
    await expect(hilos(pageL)).toContainText('El de la guía');
    await expect(hilos(pageL).getByLabel('Tu respuesta')).toHaveValue('borrador de Lucía');

    // Lucía no puede editar lo de Ana (no tiene el botón); Ana resuelve el hilo (es propietaria).
    await expect(hilos(pageL).locator('.comentario').nth(1).getByRole('button', { name: 'Editar' })).toHaveCount(0);
    await hilos(page).getByRole('button', { name: 'Resolver' }).click();
    await expect(hilos(pageL)).toHaveCount(0);
    await expect(pageL.getByText('No hay hilos abiertos.')).toBeVisible();
    await pageL.getByLabel('Mostrar resueltos (1)').check();
    await expect(hilos(pageL)).toHaveCount(1);
    await expect(hilos(pageL).getByRole('heading')).toHaveText(`Hilo de ${LUCIA.nombre} (resuelto)`);

    // Ana borra "tema" del texto: el hilo queda sobre texto eliminado.
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
    await expect(hilos(pageL).locator('.cita')).toHaveText('El texto comentado se eliminó.');

    expect(await axeEstable(pageL)).toEqual([]);
    expect(await axeEstable(page)).toEqual([]);
  } finally {
    await contextoL.close();
  }
});

test('versiones: guardar, comparar en el Web Worker y restaurar como cambio nuevo que llega al editor; quien lee no restaura', async ({ page, browser, baseURL }) => {
  const servidor = relevo();
  const versiones = versionesSimuladas(servidor);
  await versiones.registrar(page, ANA);
  const a = await abrirDocumento(page, ANA, servidor, { rol: 'propietario' });
  await a.editor.click();
  await page.keyboard.type('uno\ndos\n');
  await expect.poll(() => servidor.doc.getText('contenido').toString()).toBe('uno\ndos\n');

  // El historial en otra pestaña de Ana (el editor sigue abierto en la primera).
  const historial = await page.context().newPage();
  await versiones.registrar(historial, ANA);
  await abrirDocumento(historial, ANA, servidor, { vista: 'versiones', rol: 'propietario' });
  await expect(historial.getByText('Todavía no hay versiones de este documento.')).toBeVisible();
  await historial.getByRole('button', { name: 'Guardar una versión ahora' }).click();
  // El aviso visible. El mismo texto llega 50 ms después al anunciador de lectores de pantalla (#anuncios):
  // getByText encontraba uno o los dos según el momento, y con dos fallaba por el modo estricto.
  await expect(historial.getByRole('status').filter({ hasText: 'Guardaste la versión 1.' })).toBeVisible();

  // Ana sigue escribiendo; la comparación (en el Web Worker) muestra lo agregado.
  await page.keyboard.type('tres\n');
  await expect.poll(() => servidor.doc.getText('contenido').toString()).toBe('uno\ndos\ntres\n');
  const trabajador = historial.waitForEvent('worker');
  await historial.getByRole('button', { name: 'Comparar' }).click();
  await trabajador;
  await expect(historial.getByRole('status').filter({ hasText: 'línea' })).toHaveText('1 línea agregada y 0 líneas quitadas.');
  await expect(historial.locator('.linea-agregada')).toHaveText(['+Agregada: tres']);

  // Restaurar la 1: confirma, el editor de Ana pasa a ese texto y queda la versión 2 que apunta a la 1.
  await historial.getByRole('button', { name: 'Restaurar' }).click();
  await historial.getByRole('button', { name: 'Sí, restaurar la 1' }).click();
  await expect(historial.getByRole('status').filter({ hasText: 'Restauraste la versión 1: quedó como la versión 2.' })).toBeVisible();
  await expect.poll(() => texto(page)).toBe('uno\ndos\n');
  const filas = historial.locator('ol.filas .fila-titulo');
  await expect(filas).toHaveText([/^Versión 2 · Restauración de la 1 · Ana Ficticia/, /^Versión 1 · Guardada a mano · Ana Ficticia/]);
  expect(await axeEstable(historial)).toEqual([]);

  // Una lectora ve el historial y compara, pero no guarda ni restaura.
  const { contexto, pagina } = await segundaPersona(browser, baseURL, 'light');
  try {
    await versiones.registrar(pagina, LUCIA);
    await abrirDocumento(pagina, LUCIA, servidor, { vista: 'versiones', rol: 'lector' });
    await expect(pagina.locator('ol.filas .fila-titulo').first()).toHaveText(/^Versión 2 · Restauración de la 1/);
    await expect(pagina.getByRole('button', { name: 'Restaurar' })).toHaveCount(0);
    await expect(pagina.getByRole('button', { name: 'Guardar una versión ahora' })).toHaveCount(0);

    // Bloque R: quien lee también verifica la cadena; si alguien la manipuló en la base, lo ve como error.
    const verificada = pagina.waitForResponse(`**/api/documentos/${DOC}/versiones/verificacion`);
    await pagina.getByRole('button', { name: 'Verificar la cadena' }).click();
    await verificada;
    await expect(pagina.locator('.verificacion .aviso-exito')).toHaveText('Listo: La cadena está íntegra: 2 versiones verificadas.');
    versiones.alterar(1);
    const otra = pagina.waitForResponse(`**/api/documentos/${DOC}/versiones/verificacion`);
    await pagina.getByRole('button', { name: 'Verificar la cadena' }).click();
    await otra;
    await expect(pagina.locator('.verificacion').getByRole('alert')).toHaveText('Error: La cadena está alterada desde la versión 1.');
    expect(await axeEstable(pagina)).toEqual([]);
  } finally {
    await contexto.close();
  }
});
