// Bloque L de punta a punta: dos personas editan el MISMO documento a la vez. El API y el WebSocket son
// simulados: un relevo en esta prueba hace de servidor (sincronía de Yjs, presencia con el nombre de la
// cuenta y el rol al entrar, como el backend; ADR 0002). Las esperas de red se registran ANTES de la
// acción. Datos SOLO ficticios (@example.com, nombres inventados).
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { readSyncMessage, writeSyncStep1 } from 'y-protocols/sync';
import * as Y from 'yjs';
import { axeEstable, cuerpoError, expect, test } from './fixtures.mjs';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').WebSocketRoute} WebSocketRoute */
/** @typedef {{ id: string, nombre: string, correo: string, rol: 'editor' }} Cuenta */

const DOC = '00000000-0000-4000-8000-0000000000d1';
const ANA = /** @type {Cuenta} */ ({ id: '00000000-0000-4000-8000-0000000000a1', nombre: 'Ana Ficticia', correo: 'ana@example.com', rol: 'editor' });
const BETO = /** @type {Cuenta} */ ({ id: '00000000-0000-4000-8000-0000000000b2', nombre: 'Beto Inventado', correo: 'beto@example.com', rol: 'editor' });
const MENSAJE = { sync: 0, presencia: 1, control: 2 };

/** El servidor de la prueba: un Y.Doc y una presencia, y quién está conectado. */
function relevo() {
  const doc = new Y.Doc();
  const presencia = new Awareness(doc);
  presencia.setLocalState(null);
  /** @type {Set<WebSocketRoute>} */
  const conexiones = new Set();
  const aTodos = (/** @type {Uint8Array} */ marco, /** @type {unknown} */ salvo) => {
    for (const ws of conexiones) if (ws !== salvo) ws.send(Buffer.from(marco));
  };
  doc.on('update', (/** @type {Uint8Array} */ u, /** @type {unknown} */ origen) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.sync);
    encoding.writeVarUint(e, 2);
    encoding.writeVarUint8Array(e, u);
    aTodos(encoding.toUint8Array(e), origen);
  });
  presencia.on('update', (/** @type {{ added: number[], updated: number[], removed: number[] }} */ c, /** @type {unknown} */ origen) => {
    const e = encoding.createEncoder();
    encoding.writeVarUint(e, MENSAJE.presencia);
    encoding.writeVarUint8Array(e, encodeAwarenessUpdate(presencia, [...c.added, ...c.updated, ...c.removed]));
    aTodos(encoding.toUint8Array(e), origen);
  });

  /** @param {WebSocketRoute} ws @param {Cuenta} cuenta */
  function conectar(ws, cuenta) {
    conexiones.add(ws);
    const control = encoding.createEncoder();
    encoding.writeVarUint(control, MENSAJE.control);
    encoding.writeVarString(control, JSON.stringify({ tipo: 'rol', rol: 'editor' }));
    ws.send(Buffer.from(encoding.toUint8Array(control)));
    const paso1 = encoding.createEncoder();
    encoding.writeVarUint(paso1, MENSAJE.sync);
    writeSyncStep1(paso1, doc);
    ws.send(Buffer.from(encoding.toUint8Array(paso1)));
    const ids = [...presencia.getStates().keys()];
    if (ids.length > 0) {
      const p = encoding.createEncoder();
      encoding.writeVarUint(p, MENSAJE.presencia);
      encoding.writeVarUint8Array(p, encodeAwarenessUpdate(presencia, ids));
      ws.send(Buffer.from(encoding.toUint8Array(p)));
    }
    ws.onMessage((m) => {
      const dec = decoding.createDecoder(new Uint8Array(/** @type {Buffer} */ (m)));
      const tipo = decoding.readVarUint(dec);
      if (tipo === MENSAJE.sync) {
        const e = encoding.createEncoder();
        encoding.writeVarUint(e, MENSAJE.sync);
        readSyncMessage(dec, e, doc, ws);
        if (encoding.length(e) > 1) ws.send(Buffer.from(encoding.toUint8Array(e)));
      } else if (tipo === MENSAJE.presencia) {
        // Como el backend: la cuenta y el nombre los pone el servidor.
        const entrada = decoding.createDecoder(decoding.readVarUint8Array(dec));
        const salida = encoding.createEncoder();
        const n = decoding.readVarUint(entrada);
        encoding.writeVarUint(salida, n);
        for (let i = 0; i < n; i++) {
          encoding.writeVarUint(salida, decoding.readVarUint(entrada));
          encoding.writeVarUint(salida, decoding.readVarUint(entrada));
          const estado = JSON.parse(decoding.readVarString(entrada));
          encoding.writeVarString(salida, JSON.stringify(estado === null ? null : { ...estado, usuario: { id: cuenta.id, nombre: cuenta.nombre }, user: { ...estado.user, name: cuenta.nombre } }));
        }
        applyAwarenessUpdate(presencia, encoding.toUint8Array(salida), ws);
      }
    });
    ws.onClose(() => conexiones.delete(ws));
  }
  return { doc, conexiones, conectar };
}

/**
 * Una persona con sesión abierta en el editor del documento.
 * @param {Page} page @param {Cuenta} cuenta @param {ReturnType<typeof relevo>} servidor
 */
async function abrirEditor(page, cuenta, servidor) {
  const json = (/** @type {import('@playwright/test').Route} */ r, /** @type {unknown} */ cuerpo, estado = 200) =>
    r.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify(cuerpo) });
  await page.route('**/api/auth/refresco', (r) => json(r, { accessToken: `token-ficticio-${cuenta.nombre}`, expiraEn: Math.floor(Date.now() / 1000) + 900, usuario: cuenta }));
  await page.route(`**/api/documentos/${DOC}`, (r) =>
    json(r, { id: DOC, espacioId: '00000000-0000-4000-8000-0000000000e1', titulo: 'Guía de prueba', rol: 'editor', propietario: { id: ANA.id, nombre: ANA.nombre }, creadoEn: '2026-01-15T12:00:00.000Z', actualizadoEn: '2026-01-15T12:00:00.000Z' }),
  );
  /** @type {unknown[]} */
  const tickets = [];
  await page.route('**/api/tiempo-real/tickets', (r) => {
    tickets.push(r.request().postDataJSON());
    return json(r, { ticket: 'A'.repeat(43), expiraEnSegundos: 30 }, 201);
  });
  /** @type {WebSocketRoute[]} */
  const sockets = [];
  await page.routeWebSocket('**/api/tiempo-real', (ws) => {
    sockets.push(ws);
    servidor.conectar(ws, cuenta);
  });
  await page.goto(`/#/documentos/${DOC}/editar`);
  await expect(red(page)).toContainText('Conectado');
  return { tickets, sockets, editor: page.getByRole('textbox', { name: 'Contenido de Guía de prueba' }) };
}

/** El indicador de conexión. */
const red = (/** @type {Page} */ page) => page.getByRole('status').filter({ hasText: 'Conexión:' });

/** El texto del editor, sin los cursores remotos (que llevan el nombre como texto dentro de la línea). */
const texto = (/** @type {Page} */ page) =>
  page.locator('.cm-content').evaluate((el) => {
    const copia = /** @type {HTMLElement} */ (el.cloneNode(true));
    for (const c of copia.querySelectorAll('.cm-ySelectionCaret')) c.remove();
    return [...copia.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n');
  });

/**
 * La segunda persona, en su propio contexto (otra cookie, otra sesión) y con el API cerrado por defecto.
 * @param {import('@playwright/test').Browser} browser @param {string | undefined} baseURL @param {'light' | 'dark'} colorScheme
 */
async function segundaPersona(browser, baseURL, colorScheme) {
  const contexto = await browser.newContext({ baseURL, locale: 'es-MX', timezoneId: 'UTC', colorScheme, serviceWorkers: 'block' });
  const pagina = await contexto.newPage();
  await pagina.route('**/api/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: cuerpoError('sin_refresco', 'Inicia sesión de nuevo') }));
  return { contexto, pagina };
}

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
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Ver sin editar' })).toBeFocused();

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
