// Bloque Q de punta a punta: el asistente de IA en el editor, en la lectura y en la lista de documentos.
// El API y el WebSocket son SIMULADOS (relevo de colaboracion.mjs; el autocompletado va por sus mensajes
// de control). Las esperas de red se registran ANTES de la acción. Datos SOLO ficticios.
//
// La carga diferida se comprueba en la RED con el build real: qué archivos .js pide el navegador. Los
// nombres salen del manifiesto de Vite (dist/.vite/manifest.json), no de patrones adivinados.
import { readFileSync } from 'node:fs';
import { ANA, DOC, LUCIA, abrirDocumento, abrirEditor, json, relevo, texto } from './colaboracion.mjs';
import { axeEstable, cuerpoError, expect, test } from './fixtures.mjs';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Route} Route */

/** @type {Record<string, { file: string, imports?: string[] }>} */
const MANIFIESTO = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const archivo = (/** @type {string} */ clave) => `/${MANIFIESTO[clave]?.file ?? `falta-${clave}`}`;
const PANEL = archivo('src/diferidas/ia.js');
const AUTOCOMPLETADO = archivo('src/diferidas/ia-autocompletado.js');
const BUSQUEDA = archivo('src/diferidas/ia-busqueda.js');
/** CodeMirror: lo que el autocompletado importa estáticamente (y nada más importa: es solo eso). */
const CODEMIRROR = (MANIFIESTO['src/diferidas/ia-autocompletado.js']?.imports ?? []).map(archivo);

const ANUNCIO = 'Sugerencia de la IA disponible: Tab para aceptarla, Escape para descartarla.';

/** Las rutas .js que pide la página (registrado ANTES de navegar). */
function scripts(/** @type {Page} */ page) {
  /** @type {Set<string>} */
  const pedidos = new Set();
  page.on('request', (r) => {
    const ruta = new URL(r.url()).pathname;
    if (ruta.endsWith('.js')) pedidos.add(ruta);
  });
  return pedidos;
}

/** Lo que se anuncia en la región viva (#anuncios), en orden: se registra antes de cargar la página. */
async function grabarAnuncios(/** @type {Page} */ page) {
  await page.addInitScript(() => {
    /** @type {any} */ (window).__anuncios = [];
    document.addEventListener('DOMContentLoaded', () => {
      const region = document.getElementById('anuncios');
      if (!region) return;
      new MutationObserver(() => {
        const t = region.textContent ?? '';
        if (t) /** @type {any} */ (window).__anuncios.push(t);
      }).observe(region, { childList: true, characterData: true, subtree: true });
    });
  });
  return () => page.evaluate(() => /** @type {string[]} */ (/** @type {any} */ (window).__anuncios));
}

/** Una respuesta SSE completa como la del API (resumir y mejorar). */
const sse = (/** @type {Route} */ r, /** @type {string[]} */ partes) =>
  r.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: `${partes.map((t) => `event: fragmento\ndata: ${JSON.stringify({ texto: t })}\n\n`).join(': latido\n\n')}event: fin\ndata: {"tokensEntrada":12,"tokensSalida":7}\n\n`,
  });

/** El uso del día (lo pide el panel al abrirse). */
const rutaUso = (/** @type {Page} */ page) =>
  page.route('**/api/ia/uso', (r) => json(r, { hoy: { peticiones: 4, tokensEntrada: 100, tokensSalida: 50 }, topes: { peticionesDia: 200, tokensDia: 200000 }, renuevaEnSegundos: 3600 }));

/** Escribe en el editor y selecciona la línea. */
async function escribirYSeleccionar(/** @type {Page} */ page, /** @type {import('@playwright/test').Locator} */ editor, /** @type {string} */ t) {
  await editor.click();
  await page.keyboard.type(t);
  await page.keyboard.press('Shift+Home');
}

const panel = (/** @type {Page} */ page) => page.getByRole('region', { name: 'IA Asistente' });

test.beforeEach(({ page }) => {
  // Ningún diálogo nativo (alert de un XSS, confirm): fallaría la prueba.
  page.on('dialog', (d) => {
    throw new Error(`diálogo inesperado: ${d.message()}`);
  });
});

test('la IA no se descarga hasta el primer uso: el panel al abrirlo, el autocompletado al activarlo', async ({ page }) => {
  expect(CODEMIRROR.length).toBeGreaterThan(0);
  const pedidos = scripts(page);
  await rutaUso(page);
  const servidor = relevo();
  await abrirEditor(page, ANA, servidor);
  await expect(page.getByRole('button', { name: 'IA', exact: true })).toBeVisible();
  expect([...pedidos].filter((p) => [PANEL, AUTOCOMPLETADO, BUSQUEDA].includes(p))).toEqual([]);

  const panelPedido = page.waitForRequest((r) => new URL(r.url()).pathname === PANEL);
  await page.getByRole('button', { name: 'IA', exact: true }).click();
  await panelPedido;
  await expect(panel(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'IA', exact: true })).toHaveAttribute('aria-expanded', 'true');
  expect(pedidos.has(AUTOCOMPLETADO)).toBe(false);
  // Desactivadas por defecto (solo en memoria).
  const interruptor = page.getByLabel('Sugerencias de la IA mientras escribes');
  await expect(interruptor).not.toBeChecked();

  const autoPedido = page.waitForRequest((r) => new URL(r.url()).pathname === AUTOCOMPLETADO);
  await interruptor.check();
  await autoPedido;
  expect(pedidos.has(BUSQUEDA)).toBe(false);
});

test('explicar: la salida de la IA se muestra saneada (sin HTML ni enlaces javascript:)', async ({ page }) => {
  await rutaUso(page);
  const servidor = relevo();
  const a = await abrirEditor(page, ANA, servidor);
  await escribirYSeleccionar(page, a.editor, 'El CRDT converge.');
  /** @type {unknown[]} */
  const cuerpos = [];
  await page.route('**/api/ia/explicar', (r) => {
    cuerpos.push(r.request().postDataJSON());
    return json(r, { texto: '<img src=x onerror=alert(1)> Un **CRDT** une cambios. [ver](javascript:alert(2)) <script>alert(3)</script>', tokensEntrada: 5, tokensSalida: 9 });
  });
  await page.getByRole('button', { name: 'IA', exact: true }).click();
  const pedido = page.waitForResponse('**/api/ia/explicar');
  await panel(page).getByRole('button', { name: 'Explicar la selección' }).click();
  await pedido;
  const respuesta = page.locator('.ia-respuesta');
  await expect(respuesta.locator('strong')).toHaveText('CRDT');
  await expect(respuesta.locator('img, script, iframe')).toHaveCount(0);
  await expect(respuesta.locator('[href^="javascript"], [onerror]')).toHaveCount(0);
  await expect(panel(page).getByRole('status').filter({ hasText: 'Listo.' })).toBeVisible();
  expect(cuerpos).toEqual([{ documentoId: DOC, contenido: 'El CRDT converge.' }]);
  await expect(panel(page).getByText('Hoy: 4 de 200 pedidos de IA.')).toBeVisible();
});

test('resumir en streaming, y Detener aborta un pedido en curso', async ({ page }) => {
  await rutaUso(page);
  const servidor = relevo();
  const a = await abrirEditor(page, ANA, servidor);
  await a.editor.click();
  await page.keyboard.type('Primera parte. Segunda parte.');
  await page.route('**/api/ia/resumir', (r) => sse(r, ['Resumen ', 'en **dos** partes.']));
  await page.getByRole('button', { name: 'IA', exact: true }).click();
  const hecho = page.waitForResponse('**/api/ia/resumir');
  await panel(page).getByRole('button', { name: 'Resumir el documento' }).click();
  await hecho;
  await expect(page.locator('.ia-respuesta')).toHaveText('Resumen en dos partes.');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Listo.' })).toBeVisible();

  // Un pedido que no contesta: Detener lo aborta (el backend cancela al cerrarse la conexión).
  /** @type {() => void} */
  let soltar = () => {};
  const colgado = new Promise((r) => {
    soltar = () => r(undefined);
  });
  await page.route('**/api/ia/resumir', async (r) => {
    await colgado;
    await r.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }).catch(() => {});
  });
  const enviado = page.waitForRequest('**/api/ia/resumir');
  await panel(page).getByRole('button', { name: 'Resumir el documento' }).click();
  await enviado;
  const detener = panel(page).getByRole('button', { name: 'Detener' });
  await expect(detener).toBeVisible();
  const abortado = page.waitForEvent('requestfailed', (r) => r.url().endsWith('/api/ia/resumir'));
  await detener.click();
  await abortado;
  await expect(panel(page).getByRole('status').filter({ hasText: 'Detenida.' })).toBeVisible();
  await expect(detener).toBeHidden();
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  soltar();
});

test('mejorar: una propuesta que no se aplica sola; Reemplazar la escribe como un cambio normal (llega al CRDT)', async ({ page }) => {
  await rutaUso(page);
  const servidor = relevo();
  const a = await abrirEditor(page, ANA, servidor);
  await escribirYSeleccionar(page, a.editor, 'texto viejo y largo');
  /** @type {unknown[]} */
  const cuerpos = [];
  await page.route('**/api/ia/mejorar', (r) => {
    cuerpos.push(r.request().postDataJSON());
    return sse(r, ['Texto ', 'nuevo.']);
  });
  await page.getByRole('button', { name: 'IA', exact: true }).click();
  await panel(page).getByLabel('Estilo').selectOption('breve');
  const hecho = page.waitForResponse('**/api/ia/mejorar');
  await panel(page).getByRole('button', { name: 'Mejorar la selección' }).click();
  await hecho;
  await expect(panel(page).getByText('Propuesta de la IA. No se aplica sola: elige qué hacer.')).toBeVisible();
  expect(cuerpos).toEqual([{ documentoId: DOC, contenido: 'texto viejo y largo', estilo: 'breve' }]);
  // Nada cambió todavía, ni en la pantalla ni en el servidor.
  expect(await texto(page)).toBe('texto viejo y largo');
  expect(servidor.doc.getText('contenido').toString()).toBe('texto viejo y largo');
  await expect(panel(page).getByRole('button', { name: 'Reemplazar selección' })).toBeFocused();
  await panel(page).getByRole('button', { name: 'Reemplazar selección' }).click();
  await expect.poll(() => texto(page)).toBe('Texto nuevo.');
  await expect.poll(() => servidor.doc.getText('contenido').toString()).toBe('Texto nuevo.');
  await expect(panel(page).getByRole('status').filter({ hasText: 'Se reemplazó la selección.' })).toBeVisible();
});

test('el tope diario (429) se muestra como error, con la hora en que se renueva', async ({ page }) => {
  await rutaUso(page);
  const servidor = relevo();
  const a = await abrirEditor(page, ANA, servidor);
  await escribirYSeleccionar(page, a.editor, 'Algo que explicar.');
  await page.route('**/api/ia/explicar', (r) =>
    r.fulfill({ status: 429, contentType: 'application/json', headers: { 'retry-after': '3600' }, body: cuerpoError('tope_diario_ia', 'Tope diario') }),
  );
  await page.getByRole('button', { name: 'IA', exact: true }).click();
  const pedido = page.waitForResponse('**/api/ia/explicar');
  await panel(page).getByRole('button', { name: 'Explicar la selección' }).click();
  await pedido;
  const alerta = panel(page).getByRole('alert');
  await expect(alerta).toHaveText(/^Error: Llegaste al uso diario de la IA\. Se renueva a las \d\d:\d\d\.$/);
  // Error en --color-peligro (aviso de error), nunca en violeta.
  await expect(alerta).toHaveClass(/aviso-error/);
});

test('autocompletado: pide tras una pausa, ignora lo viejo, Tab acepta, Escape descarta y el anuncio no se repite mientras se escribe', async ({ page }) => {
  await rutaUso(page);
  const anuncios = await grabarAnuncios(page);
  const servidor = relevo();
  /** @type {{ m: Record<string, unknown>, responder: (r: unknown) => void }[]} */
  const pedidos = [];
  servidor.atencion.alControl = (m, responder) => {
    if (m.tipo === 'ia.autocompletar') pedidos.push({ m, responder });
  };
  const a = await abrirEditor(page, ANA, servidor);
  await a.editor.click();
  await page.keyboard.type('Hola');
  await page.getByRole('button', { name: 'IA', exact: true }).click();
  await page.getByLabel('Sugerencias de la IA mientras escribes').check();
  await expect(panel(page).getByRole('status').filter({ hasText: 'Sugerencias de la IA activadas.' })).toBeVisible();

  const fantasma = page.locator('.cm-content .sugerencia-ia');
  const contestar = (/** @type {number} */ i, /** @type {string} */ t) => {
    const p = pedidos[i];
    if (!p) throw new Error(`no hay pedido ${String(i)}`);
    p.responder({ tipo: 'ia.sugerencia', pedido: p.m.pedido, texto: t });
  };
  const vecesAnunciado = async () => (await anuncios()).filter((x) => x === ANUNCIO).length;

  // 1. Escribir y pausar: un pedido con el contexto; la sugerencia aparece sin entrar en el documento.
  await a.editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' mun');
  await expect.poll(() => pedidos.length).toBe(1);
  expect(pedidos[0]?.m).toMatchObject({ tipo: 'ia.autocompletar', antes: 'Hola mun', despues: '' });
  contestar(0, 'do');
  await expect(fantasma).toHaveText('do');
  await expect(fantasma).toHaveAttribute('aria-hidden', 'true');
  // En pantalla se ve dentro de la línea; en el documento (y en el servidor) no está.
  expect(await texto(page)).toBe('Hola mundo');
  expect(servidor.doc.getText('contenido').toString()).toBe('Hola mun');
  await expect.poll(vecesAnunciado).toBe(1);

  // 2. Se sigue escribiendo: la sugerencia se va; la siguiente NO se vuelve a anunciar.
  await page.keyboard.type('d');
  await expect(fantasma).toHaveCount(0);
  await expect.poll(() => pedidos.length).toBe(2);
  // Una sugerencia vieja (de un pedido anterior) que llega tarde se ignora.
  await page.keyboard.type('o');
  await expect.poll(() => pedidos.length).toBe(3);
  contestar(1, 'XXX');
  await page.waitForTimeout(200);
  await expect(fantasma).toHaveCount(0);
  contestar(2, ' entero');
  await expect(fantasma).toHaveText(' entero');
  await page.waitForTimeout(200);
  expect(await vecesAnunciado()).toBe(1);

  // 3. Escape descarta (el documento no cambia) y rearma el anuncio.
  await page.keyboard.press('Escape');
  await expect(fantasma).toHaveCount(0);
  expect(servidor.doc.getText('contenido').toString()).toBe('Hola mundo');
  await page.keyboard.type(',');
  await expect.poll(() => pedidos.length).toBe(4);
  contestar(3, ' y más');
  await expect(fantasma).toHaveText(' y más');
  await expect.poll(vecesAnunciado).toBe(2);

  // 4. Tab acepta: un cambio normal del editor, que llega al servidor; el foco sigue en el editor.
  await page.keyboard.press('Tab');
  await expect.poll(() => servidor.doc.getText('contenido').toString()).toBe('Hola mundo, y más');
  await expect(fantasma).toHaveCount(0);
  await expect(a.editor).toBeFocused();

  // 5. Apagar el interruptor: no se pide nada más. (Aceptar también es escribir: primero llega el pedido
  // que sigue a la aceptación, para no confundirlo con uno posterior al apagado.)
  await expect.poll(() => pedidos.length).toBe(5);
  await page.getByLabel('Sugerencias de la IA mientras escribes').uncheck();
  const antes = pedidos.length;
  await a.editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('!');
  await page.waitForTimeout(800);
  expect(pedidos.length).toBe(antes);
});

test('quien lee: Explicar y Resumir sin Mejorar ni sugerencias, y SIN descargar CodeMirror (ADR 0004)', async ({ page }) => {
  expect(CODEMIRROR.length).toBeGreaterThan(0);
  const pedidos = scripts(page);
  await rutaUso(page);
  const servidor = relevo();
  servidor.doc.getText('contenido').insert(0, 'Documento para leer. Tiene dos frases.');
  await abrirDocumento(page, LUCIA, servidor, { vista: 'leer', rol: 'lector' });
  await page.route('**/api/ia/resumir', (r) => sse(r, ['Un documento ', 'breve.']));

  const panelPedido = page.waitForRequest((r) => new URL(r.url()).pathname === PANEL);
  await page.getByRole('button', { name: 'IA', exact: true }).click();
  await panelPedido;
  await expect(panel(page).getByRole('button', { name: 'Explicar la selección' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Resumir el documento' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Mejorar la selección' })).toBeHidden();
  await expect(panel(page).getByLabel('Sugerencias de la IA mientras escribes')).toBeHidden();
  await expect(panel(page).getByRole('button', { name: 'Actualizar índice de búsqueda' })).toBeHidden();

  const hecho = page.waitForResponse('**/api/ia/resumir');
  await panel(page).getByRole('button', { name: 'Resumir el documento' }).click();
  await hecho;
  await expect(page.locator('.ia-respuesta')).toHaveText('Un documento breve.');

  expect([...pedidos].filter((p) => CODEMIRROR.includes(p))).toEqual([]);
  expect(pedidos.has(AUTOCOMPLETADO)).toBe(false);
  // Escape cierra el panel y devuelve el foco al botón.
  await panel(page).getByRole('button', { name: 'Resumir el documento' }).focus();
  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'IA', exact: true })).toBeFocused();
});

// ─── Búsqueda en la lista de documentos ─────────────────────────────────────────

const ESPACIO = '00000000-0000-4000-8000-0000000000e1';

/** La lista de documentos con un espacio y la búsqueda simulada. */
async function abrirLista(/** @type {Page} */ page) {
  await page.route('**/api/auth/refresco', (r) => json(r, { accessToken: 'token-ficticio', expiraEn: Math.floor(Date.now() / 1000) + 900, usuario: ANA }));
  await page.route('**/api/espacios', (r) => json(r, { espacios: [{ id: ESPACIO, nombre: 'Equipo Ficticio', rol: 'editor', miembros: 2 }] }));
  await page.route(`**/api/espacios/${ESPACIO}/documentos`, (r) =>
    json(r, { documentos: [{ id: DOC, espacioId: ESPACIO, titulo: 'Guía de prueba', rol: 'editor', propietario: { id: ANA.id, nombre: ANA.nombre } }] }),
  );
  /** @type {unknown[]} */
  const consultas = [];
  await page.route(`**/api/espacios/${ESPACIO}/buscar`, (r) => {
    consultas.push(r.request().postDataJSON());
    return json(r, { resultados: [{ documentoId: DOC, titulo: 'Guía de prueba', fragmento: 0, texto: 'Para desplegar, <img src=x onerror=alert(1)> usa el contenedor.', similitud: 0.8312 }] });
  });
  await page.goto('/#/documentos');
  await expect(page.getByRole('link', { name: 'Guía de prueba', exact: true })).toBeVisible();
  return { consultas };
}

test('buscar por significado: carga solo la diferida de búsqueda y muestra el fragmento como texto', async ({ page }) => {
  const pedidos = scripts(page);
  const { consultas } = await abrirLista(page);
  expect(pedidos.has(BUSQUEDA)).toBe(false);
  const busqueda = page.getByRole('search', { name: 'Buscar por significado en Equipo Ficticio' });
  await busqueda.getByLabel('IA Buscar por significado').fill('cómo se despliega');
  const respuesta = page.waitForResponse(`**/api/espacios/${ESPACIO}/buscar`);
  await busqueda.getByRole('button', { name: 'Buscar' }).click();
  await respuesta;
  await expect(busqueda.getByRole('status')).toHaveText('1 resultado parecido.');
  await expect(busqueda.getByRole('listitem')).toContainText('parecido: 83 %');
  await expect(busqueda.locator('.fragmento-ia')).toHaveText('Para desplegar, <img src=x onerror=alert(1)> usa el contenedor.');
  await expect(busqueda.locator('img')).toHaveCount(0);
  await expect(busqueda.getByRole('link', { name: 'Guía de prueba' })).toHaveAttribute('href', `#/documentos/${DOC}`);
  expect(consultas).toEqual([{ consulta: 'cómo se despliega' }]);
  expect(pedidos.has(BUSQUEDA)).toBe(true);
  expect([...pedidos].filter((p) => p === PANEL || p === AUTOCOMPLETADO || CODEMIRROR.includes(p))).toEqual([]);
});

// ─── Accesibilidad, en los dos temas ─────────────────────────────────────────────

for (const esquema of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`axe con la IA, tema ${esquema === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: esquema });

    test('panel con respuesta y propuesta, y error', async ({ page }) => {
      await rutaUso(page);
      const servidor = relevo();
      const a = await abrirEditor(page, ANA, servidor);
      await escribirYSeleccionar(page, a.editor, 'Un párrafo para mejorar.');
      await page.route('**/api/ia/mejorar', (r) => sse(r, ['Un párrafo **mejor**.']));
      await page.getByRole('button', { name: 'IA', exact: true }).click();
      const hecho = page.waitForResponse('**/api/ia/mejorar');
      await panel(page).getByRole('button', { name: 'Mejorar la selección' }).click();
      await hecho;
      await expect(panel(page).getByRole('button', { name: 'Reemplazar selección' })).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);

      await page.route('**/api/ia/explicar', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: cuerpoError('ia_no_disponible', 'No') }));
      const fallo = page.waitForResponse('**/api/ia/explicar');
      await panel(page).getByRole('button', { name: 'Explicar la selección' }).click();
      await fallo;
      await expect(panel(page).getByRole('alert')).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);
    });

    test('búsqueda con resultados', async ({ page }) => {
      await abrirLista(page);
      const busqueda = page.getByRole('search', { name: 'Buscar por significado en Equipo Ficticio' });
      await busqueda.getByLabel('IA Buscar por significado').fill('despliegue');
      const respuesta = page.waitForResponse(`**/api/espacios/${ESPACIO}/buscar`);
      await busqueda.getByRole('button', { name: 'Buscar' }).click();
      await respuesta;
      await expect(busqueda.getByRole('listitem')).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);
    });
  });
}
