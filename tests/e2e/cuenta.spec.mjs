// Bloque J de punta a punta con el API SIMULADO: perfil, foto (recorte en el cliente), cambio de correo,
// contraseña, verificación en dos pasos, sesiones, exportar y eliminar la cuenta (con la lista del 409) y
// el panel de administración. Las esperas de red y de descarga se registran ANTES de la acción.
// Datos SOLO ficticios (@example.com, nombres inventados).
import { crc32, deflateSync } from 'node:zlib';
import { axeEstable, cuerpoError, expect, test } from './fixtures.mjs';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Route} Route */
/** @typedef {'admin' | 'editor' | 'lector'} Rol */

const ID = { lector: '00000000-0000-4000-8000-000000000021', admin: '00000000-0000-4000-8000-000000000022' };
const CODIGOS = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'IIIII-JJJJJ', 'KKKKK-LLLLL', 'MMMMM-NNNNN', 'OOOOO-PPPPP', 'QQQQQ-RRRRR', 'SSSSS-TTTTT'];

/** @param {Rol} rol */
const usuario = (rol) =>
  rol === 'admin'
    ? { id: ID.admin, nombre: 'Rosa Ficticia', correo: 'rosa@example.com', rol }
    : { id: ID.lector, nombre: 'Leo Ficticio', correo: 'leo@example.com', rol };

/** @param {Rol} rol @param {Record<string, unknown>} [extra] */
const perfil = (rol, extra = {}) => ({
  ...usuario(rol),
  telefono: null,
  creadaEn: '2026-01-15T12:00:00.000Z',
  activadaEn: '2026-01-15T12:30:00.000Z',
  mfaActivo: rol === 'admin',
  avatar: null,
  cambioCorreoPendiente: null,
  ...extra,
});

const json = (/** @type {Route} */ r, /** @type {unknown} */ cuerpo, estado = 200, cabeceras = {}) =>
  r.fulfill({ status: estado, contentType: 'application/json', headers: cabeceras, body: JSON.stringify(cuerpo) });
const fallo = (/** @type {Route} */ r, /** @type {number} */ estado, /** @type {string} */ codigo, /** @type {string} */ mensaje, /** @type {unknown} */ detalles = undefined) =>
  r.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify({ error: { ...JSON.parse(cuerpoError(codigo, mensaje)).error, ...(detalles === undefined ? {} : { detalles }) } }) });

/**
 * Registra una ruta del API y anota cada petición (método, cuerpo JSON o binario, consulta).
 * @param {Page} page
 * @param {string | RegExp} ruta  texto: la ruta exacta bajo /api; RegExp: sobre la URL completa
 * @param {(r: Route) => unknown} responder
 */
async function api(page, ruta, responder) {
  /** @type {{ metodo: string, cuerpo: any, binario: Buffer | null, tipo: string | undefined, url: string }[]} */
  const vistas = [];
  await page.route(typeof ruta === 'string' ? `**/api${ruta}` : ruta, (r) => {
    const req = r.request();
    const tipo = req.headers()['content-type'];
    vistas.push({
      metodo: req.method(),
      cuerpo: tipo === 'application/json' ? req.postDataJSON() : null,
      binario: tipo?.startsWith('image/') ? req.postDataBuffer() : null,
      tipo,
      url: req.url(),
    });
    return responder(r);
  });
  return vistas;
}

/**
 * Sesión de un rol y el perfil (GET /cuenta lo devuelve; PATCH lo modifica y lo devuelve).
 * @param {Page} page @param {Rol} rol @param {Record<string, unknown>} [extra]
 */
async function conSesion(page, rol, extra = {}) {
  const estado = { perfil: perfil(rol, extra) };
  await api(page, '/auth/refresco', (r) => json(r, { accessToken: `token-ficticio-${rol}`, expiraEn: Math.floor(Date.now() / 1000) + 900, usuario: usuario(rol) }));
  const cuenta = await api(page, '/cuenta', (r) => {
    const req = r.request();
    if (req.method() === 'PATCH') estado.perfil = { ...estado.perfil, ...req.postDataJSON() };
    return json(r, estado.perfil);
  });
  return { estado, cuenta };
}

// PNG mínimo (RGB, degradado) con un trozo de texto opcional, para probar que el recorte lo descarta.
/** @param {number} ancho @param {number} alto @param {string} [comentario] */
function png(ancho, alto, comentario) {
  const trozo = (/** @type {string} */ tipo, /** @type {Buffer} */ datos) => {
    const cab = Buffer.alloc(4);
    cab.writeUInt32BE(datos.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tipo, 'ascii'), datos])));
    return Buffer.concat([cab, Buffer.from(tipo, 'ascii'), datos, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // RGB
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const o = y * (ancho * 3 + 1) + 1 + x * 3;
      filas[o] = x % 256;
      filas[o + 1] = y % 256;
      filas[o + 2] = 128;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    comentario ? trozo('tEXt', Buffer.from(`Comment\0${comentario}`, 'latin1')) : Buffer.alloc(0),
    trozo('IDAT', deflateSync(filas)),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

/** Ancho y alto de un PNG (cabecera IHDR). @param {Buffer} b */
const tamanoPng = (b) => ({ firma: b.subarray(1, 4).toString('ascii'), ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) });

// ─── Navegación ───────────────────────────────────────────────────────────────────

test.describe('navegación de la cuenta', () => {
  test('la sección actual se marca en la navegación principal y en la de la cuenta', async ({ page }) => {
    await conSesion(page, 'lector');
    await api(page, '/cuenta/sesiones', (r) => json(r, { sesiones: [] }));
    await page.goto('/#/cuenta/sesiones');
    await expect(page.getByRole('heading', { level: 1, name: 'Sesiones abiertas' })).toBeFocused();
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Tu cuenta' })).toHaveAttribute('aria-current', 'page');
    const sub = page.getByRole('navigation', { name: 'Secciones de tu cuenta' });
    await expect(sub.getByRole('link', { name: 'Sesiones' })).toHaveAttribute('aria-current', 'page');
    await expect(sub.locator('[aria-current]')).toHaveCount(1);
    await expect(page).toHaveTitle('Sesiones abiertas · Cuaderno');
  });

  test('"Administración" solo se muestra a ese rol; para otro, la ruta dice "Sin permiso"', async ({ page }) => {
    await conSesion(page, 'lector');
    await page.goto('/#/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Sin permiso' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Administración' })).toBeHidden();
  });

  test('sin sesión, una sección de la cuenta lleva a entrar', async ({ page }) => {
    await page.goto('/#/cuenta/datos');
    await expect(page).toHaveURL(/#\/entrar$/);
  });
});

// ─── Perfil ───────────────────────────────────────────────────────────────────────

test.describe('perfil', () => {
  test('muestra la cuenta y guarda SOLO lo que cambió (teléfono normalizado)', async ({ page }) => {
    const { cuenta } = await conSesion(page, 'lector');
    await page.goto('/#/cuenta');
    await expect(page.getByText('leo@example.com')).toBeVisible();
    await expect(page.getByText('Sin foto.')).toBeVisible();
    await page.getByLabel('Teléfono (opcional)').fill('+52 55 1234-5678');
    await page.getByRole('button', { name: 'Guardar los cambios' }).click();
    await expect(page.getByText('Listo: Guardamos tus cambios.')).toBeVisible();
    expect(cuenta.filter((c) => c.metodo === 'PATCH').map((c) => c.cuerpo)).toEqual([{ telefono: '+525512345678' }]);
    await expect(page.getByLabel('Teléfono (opcional)')).toHaveValue('+525512345678');
  });

  test('un teléfono sin formato internacional se marca en el campo, sin llamar al servidor', async ({ page }) => {
    const { cuenta } = await conSesion(page, 'lector');
    await page.goto('/#/cuenta');
    await page.getByLabel('Teléfono (opcional)').fill('55 1234 5678');
    await page.getByRole('button', { name: 'Guardar los cambios' }).click();
    await expect(page.getByLabel('Teléfono (opcional)')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Teléfono (opcional)')).toBeFocused();
    expect(cuenta.filter((c) => c.metodo === 'PATCH')).toHaveLength(0);
  });

  test('un error de validación del servidor va al campo que corresponde', async ({ page }) => {
    await conSesion(page, 'lector');
    await page.goto('/#/cuenta');
    await page.route('**/api/cuenta', (r) =>
      r.request().method() === 'PATCH' ? fallo(r, 400, 'validacion', 'Datos inválidos', [{ ruta: 'nombre', mensaje: 'el nombre no es válido' }]) : r.fallback(),
    );
    await page.getByLabel('Nombre').fill('Leo Ficticio Segundo');
    await page.getByRole('button', { name: 'Guardar los cambios' }).click();
    await expect(page.getByLabel('Nombre')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Error: El nombre no es válido.')).toBeVisible();
  });

  test('con un cambio de correo pendiente, lo dice', async ({ page }) => {
    await conSesion(page, 'lector', { cambioCorreoPendiente: { correoNuevo: 'leo.nuevo@example.com', expiraEn: '2026-10-18T15:00:00.000Z' } });
    await page.goto('/#/cuenta');
    await expect(page.getByText(/cambio de correo pendiente a leo\.nuevo@example\.com/)).toBeVisible();
  });
});

// ─── Foto ─────────────────────────────────────────────────────────────────────────

test.describe('foto de perfil', () => {
  test('recorta EN EL NAVEGADOR: sube un PNG cuadrado, sin el texto del original, y la muestra', async ({ page }) => {
    const { estado } = await conSesion(page, 'lector');
    const subida = await api(page, '/cuenta/avatar', (r) => {
      estado.perfil = { ...estado.perfil, avatar: { tipo: 'image/png', ancho: 200, alto: 200, hash: 'ab'.repeat(32) } };
      return json(r, { tipo: 'image/png', ancho: 200, alto: 200, bytes: 1000, hash: 'ab'.repeat(32) });
    });
    const imagen = png(300, 200, 'GPS ficticio 19.4326,-99.1332');
    const descargas = await api(page, `/usuarios/${ID.lector}/avatar`, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: imagen }));
    await page.goto('/#/cuenta/foto');
    await page.getByLabel('Elegir una imagen').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: imagen });
    await expect(page.getByRole('img', { name: 'Vista previa del recorte' })).toBeVisible();
    // El recorte se maneja con el teclado: mover el horizontal hasta el borde derecho.
    await page.getByLabel('Posición horizontal').focus();
    await page.keyboard.press('End');
    await expect(page.getByLabel('Posición horizontal')).toHaveValue('100');
    await page.getByRole('button', { name: 'Guardar la foto' }).click();
    await expect(page.getByText('Listo: Guardamos tu foto nueva.')).toBeVisible();

    expect(subida).toHaveLength(1);
    const cuerpo = /** @type {Buffer} */ (subida[0]?.binario);
    expect(subida[0]?.tipo).toBe('image/png');
    // 300 × 200 → el cuadrado más grande es de 200: no se agranda a 512.
    expect(tamanoPng(cuerpo)).toEqual({ firma: 'PNG', ancho: 200, alto: 200 });
    expect(cuerpo.includes(Buffer.from('tEXt'))).toBe(false);
    expect(cuerpo.includes(Buffer.from('GPS ficticio'))).toBe(false);
    await expect(page.getByRole('img', { name: 'Tu foto de perfil' })).toBeVisible();
    expect(descargas.length).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Quitar la foto' })).toBeVisible();
  });

  test('una imagen que no es JPEG ni PNG se rechaza sin subir nada', async ({ page }) => {
    await conSesion(page, 'lector');
    const subida = await api(page, '/cuenta/avatar', (r) => json(r, {}));
    await page.goto('/#/cuenta/foto');
    await page.getByLabel('Elegir una imagen').setInputFiles({ name: 'animada.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await expect(page.getByText('Error: Elige una imagen JPEG o PNG.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar la foto' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Quitar la foto' })).toBeHidden(); // no hay foto que quitar
    expect(subida).toHaveLength(0);
  });

  test('el rechazo del servidor (422) se muestra', async ({ page }) => {
    await conSesion(page, 'lector');
    await api(page, '/cuenta/avatar', (r) => fallo(r, 422, 'imagen_no_valida', 'La imagen no se pudo analizar: solo JPEG o PNG válidos'));
    await page.goto('/#/cuenta/foto');
    await page.getByLabel('Elegir una imagen').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png(64, 64) });
    await page.getByRole('button', { name: 'Guardar la foto' }).click();
    await expect(page.getByRole('alert')).toContainText('La imagen no se pudo analizar');
  });

  test('quitar la foto', async ({ page }) => {
    await conSesion(page, 'lector', { avatar: { tipo: 'image/png', ancho: 64, alto: 64, hash: 'cd'.repeat(32) } });
    await api(page, `/usuarios/${ID.lector}/avatar`, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png(64, 64) }));
    const borrado = await api(page, '/cuenta/avatar', (r) => r.fulfill({ status: 204 }));
    await page.goto('/#/cuenta/foto');
    await expect(page.getByRole('img', { name: 'Tu foto de perfil' })).toBeVisible();
    await page.getByRole('button', { name: 'Quitar la foto' }).click();
    await expect(page.getByText('Listo: Quitamos tu foto.')).toBeVisible();
    await expect(page.getByText('Sin foto.')).toBeVisible();
    expect(borrado.map((b) => b.metodo)).toEqual(['DELETE']);
  });
});

// ─── Correo ───────────────────────────────────────────────────────────────────────

test.describe('cambiar el correo', () => {
  test('pide la contraseña; el servidor responde lo mismo siempre y se muestra tal cual', async ({ page }) => {
    await conSesion(page, 'lector');
    const pedido = await api(page, '/cuenta/correo', (r) => json(r, { mensaje: 'Si la dirección se puede usar, te enviamos un enlace para confirmarla.' }, 202));
    await page.goto('/#/cuenta/correo');
    await page.getByLabel('Correo nuevo').fill('leo@example.com');
    await page.getByRole('button', { name: 'Enviar el enlace' }).click();
    await expect(page.getByText('Error: Ese ya es tu correo.')).toBeVisible();
    expect(pedido).toHaveLength(0);

    await page.getByLabel('Correo nuevo').fill('leo.nuevo@example.com');
    await page.getByLabel('Tu contraseña actual').fill('una frase larga de prueba');
    await page.getByRole('button', { name: 'Enviar el enlace' }).click();
    await expect(page.getByText(/Listo: Si la dirección se puede usar, te enviamos un enlace/)).toBeVisible();
    await expect(page.getByText(/Tu correo actual \(leo@example\.com\) sigue funcionando/)).toBeVisible();
    expect(pedido[0]?.cuerpo).toEqual({ correoNuevo: 'leo.nuevo@example.com', contrasena: 'una frase larga de prueba' });
    await expect(page.getByLabel('Tu contraseña actual')).toHaveValue('');
  });

  test('contraseña incorrecta: se marca en su campo', async ({ page }) => {
    await conSesion(page, 'lector');
    await api(page, '/cuenta/correo', (r) => fallo(r, 403, 'contrasena_incorrecta', 'La contraseña no es correcta'));
    await page.goto('/#/cuenta/correo');
    await page.getByLabel('Correo nuevo').fill('leo.nuevo@example.com');
    await page.getByLabel('Tu contraseña actual').fill('otra frase cualquiera');
    await page.getByRole('button', { name: 'Enviar el enlace' }).click();
    await expect(page.getByLabel('Tu contraseña actual')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Tu contraseña actual')).toBeFocused();
  });
});

// ─── Contraseña ───────────────────────────────────────────────────────────────────

test.describe('cambiar la contraseña', () => {
  /** @param {Page} page @param {string} nueva @param {string} [repetir] */
  async function llenar(page, nueva, repetir = nueva) {
    await page.getByLabel('Contraseña actual').fill('la frase actual de prueba');
    await page.getByLabel('Contraseña nueva', { exact: true }).fill(nueva);
    await page.getByLabel('Repite la contraseña nueva').fill(repetir);
    await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
  }

  test('no coinciden: se dice en el campo, sin llamar al servidor', async ({ page }) => {
    await conSesion(page, 'lector');
    const cambio = await api(page, '/cuenta/contrasena', (r) => json(r, { cerradas: 0 }));
    await page.goto('/#/cuenta/contrasena');
    await llenar(page, 'una frase nueva y larga', 'otra frase distinta');
    await expect(page.getByText('Error: Las dos contraseñas no coinciden.')).toBeVisible();
    expect(cambio).toHaveLength(0);
  });

  test('política del servidor: la lista de lo que falla', async ({ page }) => {
    await conSesion(page, 'lector');
    await api(page, '/cuenta/contrasena', (r) => fallo(r, 400, 'contrasena_debil', 'La contraseña no cumple la política', ['Es una contraseña muy común.']));
    await page.goto('/#/cuenta/contrasena');
    await llenar(page, 'contraseña123456');
    await expect(page.locator('.lista-errores')).toContainText('Es una contraseña muy común.');
  });

  test('éxito: dice cuántas sesiones de otros dispositivos se cerraron y vacía los campos', async ({ page }) => {
    await conSesion(page, 'lector');
    const cambio = await api(page, '/cuenta/contrasena', (r) => json(r, { cerradas: 2 }));
    await page.goto('/#/cuenta/contrasena');
    await llenar(page, 'una frase nueva y larga');
    await expect(page.getByText('Listo: Cambiamos tu contraseña y cerramos 2 sesiones en otros dispositivos.')).toBeVisible();
    expect(cambio[0]?.cuerpo).toEqual({ actual: 'la frase actual de prueba', nueva: 'una frase nueva y larga' });
    await expect(page.getByLabel('Contraseña nueva', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Contraseña nueva', { exact: true })).toHaveAttribute('type', 'password');
  });

  test('la actual incorrecta se marca en su campo', async ({ page }) => {
    await conSesion(page, 'lector');
    await api(page, '/cuenta/contrasena', (r) => fallo(r, 403, 'contrasena_incorrecta', 'La contraseña no es correcta'));
    await page.goto('/#/cuenta/contrasena');
    await llenar(page, 'una frase nueva y larga');
    await expect(page.getByLabel('Contraseña actual')).toHaveAttribute('aria-invalid', 'true');
  });
});

// ─── Verificación en dos pasos ────────────────────────────────────────────────────

test.describe('verificación en dos pasos', () => {
  test('activar: secreto, un código incorrecto se marca, el correcto da los códigos (una vez) y queda activa', async ({ page }) => {
    const { estado } = await conSesion(page, 'lector');
    await api(page, '/cuenta/mfa/iniciar', (r) => json(r, { secreto: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Cuaderno:leo%40example.com?secret=JBSWY3DPEHPK3PXP' }));
    let intentos = 0;
    const confirmar = await api(page, '/cuenta/mfa/confirmar', (r) => {
      if (++intentos === 1) return fallo(r, 400, 'codigo_mfa_invalido', 'El código no es válido');
      estado.perfil = { ...estado.perfil, mfaActivo: true };
      return json(r, { codigosRespaldo: CODIGOS });
    });
    await page.goto('/#/cuenta/dos-pasos');
    await expect(page.getByText('Información: Está desactivada.')).toBeVisible();
    await page.getByRole('button', { name: 'Activar la verificación en dos pasos' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Agrega la cuenta en tu app' })).toBeFocused();
    // Un solo botón primario a la vista: "Activar" se oculta de verdad (hidden le gana a .boton).
    await expect(page.getByRole('button', { name: 'Activar la verificación en dos pasos' })).toBeHidden();
    await expect(page.locator('main .boton-primario:visible')).toHaveCount(1);
    await expect(page.locator('.codigo-secreto')).toHaveText('JBSW Y3DP EHPK 3PXP');

    await page.getByLabel('Primer código de 6 dígitos').fill('111111');
    await page.getByRole('button', { name: 'Confirmar y activar' }).click();
    await expect(page.getByLabel('Primer código de 6 dígitos')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Primer código de 6 dígitos').fill('123 456');
    await page.getByRole('button', { name: 'Confirmar y activar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Guarda tus códigos de respaldo' })).toBeFocused();
    await expect(page.getByRole('list', { name: 'Códigos de respaldo' }).getByRole('listitem')).toHaveCount(10);
    expect(confirmar.map((c) => c.cuerpo)).toEqual([{ codigo: '111111' }, { codigo: '123456' }]);
    const seguir = page.getByRole('button', { name: 'Continuar' });
    await expect(seguir).toBeDisabled();
    await page.getByLabel('Ya los guardé en un lugar seguro').check();
    await seguir.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Verificación en dos pasos' })).toBeFocused();
    await expect(page.getByText('Listo: Está activa')).toBeVisible();
  });

  test('activa (no admin): códigos nuevos y desactivar, cada uno con un código de la app', async ({ page }) => {
    const { estado } = await conSesion(page, 'lector', { mfaActivo: true });
    const nuevos = await api(page, '/cuenta/mfa/codigos-respaldo', (r) => json(r, { codigosRespaldo: CODIGOS }));
    const quitar = await api(page, '/cuenta/mfa', (r) => {
      estado.perfil = { ...estado.perfil, mfaActivo: false };
      return r.fulfill({ status: 204 });
    });
    await page.goto('/#/cuenta/dos-pasos');
    const formNuevos = page.getByRole('form', { name: 'Códigos de respaldo' });
    await formNuevos.getByLabel('Código de 6 dígitos').fill('222222');
    await formNuevos.getByRole('button', { name: 'Generar códigos nuevos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Guarda tus códigos de respaldo' })).toBeVisible();
    expect(nuevos[0]?.cuerpo).toEqual({ codigo: '222222' });
    await page.getByLabel('Ya los guardé en un lugar seguro').check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    const formQuitar = page.getByRole('form', { name: 'Desactivar' });
    await formQuitar.getByLabel('Código de 6 dígitos').fill('333333');
    await formQuitar.getByRole('button', { name: 'Desactivar la verificación en dos pasos' }).click();
    await expect(page.getByText('Información: Está desactivada.')).toBeVisible();
    expect(quitar.map((q) => [q.metodo, q.cuerpo])).toEqual([['DELETE', { codigo: '333333' }]]);
  });

  test('administración: no se ofrece desactivarla', async ({ page }) => {
    await conSesion(page, 'admin');
    await page.goto('/#/cuenta/dos-pasos');
    await expect(page.getByText(/es obligatoria: no se puede desactivar/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Desactivar la verificación en dos pasos' })).toHaveCount(0);
  });
});

// ─── Sesiones ─────────────────────────────────────────────────────────────────────

const SESIONES = [
  { id: '00000000-0000-4000-8000-0000000000a1', actual: true, creadaEn: '2026-10-16T10:00:00.000Z', ultimoUsoEn: '2026-10-17T09:00:00.000Z', expiraEn: '2026-11-16T10:00:00.000Z', ipRed: '192.0.2.0/24', ubicacion: 'Ciudad Ficticia', userAgent: 'Firefox · Linux', mfaVerificada: false },
  { id: '00000000-0000-4000-8000-0000000000a2', actual: false, creadaEn: '2026-10-10T08:00:00.000Z', ultimoUsoEn: '2026-10-15T20:00:00.000Z', expiraEn: '2026-11-10T08:00:00.000Z', ipRed: '198.51.100.0/24', ubicacion: null, userAgent: null, mfaVerificada: false },
];

test.describe('sesiones', () => {
  test('lista con "Este dispositivo"; cerrar otra y cerrar todas las demás', async ({ page }) => {
    await conSesion(page, 'lector');
    let lista = SESIONES;
    await api(page, '/cuenta/sesiones', (r) => json(r, { sesiones: lista }));
    const cerrar = await api(page, `/cuenta/sesiones/${SESIONES[1]?.id ?? ''}`, (r) => {
      lista = lista.filter((s) => s.actual);
      return r.fulfill({ status: 204 });
    });
    await page.goto('/#/cuenta/sesiones');
    await expect(page.getByRole('heading', { level: 2, name: '2 sesiones abiertas' })).toBeVisible();
    await expect(page.getByText('Este dispositivo')).toBeVisible();
    await expect(page.getByText('Navegador desconocido')).toBeVisible();
    await expect(page.getByText('192.0.2.0/24')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar esta sesión' }).click();
    await expect(page.getByRole('heading', { level: 2, name: '1 sesión abierta' })).toBeFocused();
    await expect(page.getByText('Listo: Cerramos la sesión.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar todas las demás' })).toBeHidden();
    expect(cerrar.map((c) => c.metodo)).toEqual(['DELETE']);
  });

  test('cerrar todas las demás', async ({ page }) => {
    await conSesion(page, 'lector');
    let lista = SESIONES;
    await api(page, '/cuenta/sesiones', (r) => json(r, { sesiones: lista }));
    const otras = await api(page, '/cuenta/sesiones/cerrar-otras', (r) => {
      lista = lista.filter((s) => s.actual);
      return json(r, { cerradas: 1 });
    });
    await page.goto('/#/cuenta/sesiones');
    await page.getByRole('button', { name: 'Cerrar todas las demás' }).click();
    await expect(page.getByText('Listo: Cerramos 1 sesión.')).toBeVisible();
    expect(otras.map((o) => o.metodo)).toEqual(['POST']);
  });

  test('cerrar la de este dispositivo es salir', async ({ page }) => {
    await conSesion(page, 'lector');
    await api(page, '/cuenta/sesiones', (r) => json(r, { sesiones: SESIONES }));
    const salida = await api(page, '/auth/sesion', (r) => r.fulfill({ status: 204 }));
    await page.goto('/#/cuenta/sesiones');
    await page.unroute('**/api/auth/refresco');
    await page.getByRole('button', { name: 'Salir de esta sesión' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrar' })).toBeVisible();
    expect(salida.map((s) => s.metodo)).toEqual(['DELETE']);
  });
});

// ─── Tus datos ────────────────────────────────────────────────────────────────────

test.describe('exportar y eliminar la cuenta', () => {
  test('exportar: pide la contraseña y descarga el JSON con el nombre del servidor', async ({ page }) => {
    await conSesion(page, 'lector');
    const exportacion = await api(page, '/cuenta/exportacion', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-disposition': 'attachment; filename="cuaderno-datos-2026-10-17.json"' }, body: '{"formato":"cuaderno-exportacion/v1"}' }),
    );
    await page.goto('/#/cuenta/datos');
    await page.getByLabel('Tu contraseña').first().fill('una frase larga de prueba');
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar mis datos' }).click();
    expect((await descarga).suggestedFilename()).toBe('cuaderno-datos-2026-10-17.json');
    await expect(page.getByText('Listo: Tus datos están listos: cuaderno-datos-2026-10-17.json.')).toBeVisible();
    expect(exportacion[0]?.cuerpo).toEqual({ contrasena: 'una frase larga de prueba' });
  });

  test('eliminar: hace falta marcar la casilla; el 409 dice QUÉ transferir; después se elimina', async ({ page }) => {
    await conSesion(page, 'lector', { mfaActivo: true });
    let intentos = 0;
    const eliminar = await api(page, '/cuenta', (r) => {
      if (r.request().method() !== 'DELETE') return r.fallback();
      if (++intentos === 1) {
        return fallo(r, 409, 'propiedad_compartida', 'Transfiere la propiedad antes de eliminar la cuenta', [
          { tipo: 'documento', id: '00000000-0000-4000-8000-000000000031', nombre: 'Guía de despliegue ficticia' },
          { tipo: 'espacio', id: '00000000-0000-4000-8000-000000000032', nombre: 'Equipo de ejemplo' },
        ]);
      }
      return json(r, { espaciosBorrados: 1, documentosBorrados: 3 });
    });
    await page.goto('/#/cuenta/datos');
    const form = page.getByRole('form', { name: 'Eliminar tu cuenta' });
    await form.getByLabel('Tu contraseña').fill('una frase larga de prueba');
    await form.getByLabel('Código de 6 dígitos de tu app').fill('444 444');
    await form.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(form.getByRole('alert')).toContainText('Marca «Entiendo que no se puede deshacer»');
    expect(eliminar.filter((e) => e.metodo === 'DELETE')).toHaveLength(0);

    await form.getByLabel('Entiendo que no se puede deshacer').check();
    await form.getByLabel('Tu contraseña').fill('una frase larga de prueba');
    await form.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(form.locator('.resumen-error')).toBeFocused();
    await expect(form.locator('.lista-errores li')).toHaveText(['Documento: Guía de despliegue ficticia', 'Espacio: Equipo de ejemplo']);

    await form.getByLabel('Tu contraseña').fill('una frase larga de prueba');
    await form.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(page).toHaveURL(/#\/cuenta-eliminada$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Tu cuenta se eliminó' })).toBeFocused();
    await expect(page.getByText('1 espacio donde eras el único miembro y 3 documentos')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrar' })).toBeVisible();
    expect(eliminar.filter((e) => e.metodo === 'DELETE').map((e) => e.cuerpo)).toEqual([
      { contrasena: 'una frase larga de prueba', codigo: '444444' },
      { contrasena: 'una frase larga de prueba', codigo: '444444' },
    ]);
  });

  test('eliminar con un código incorrecto: se marca en su campo', async ({ page }) => {
    await conSesion(page, 'lector', { mfaActivo: true });
    await api(page, '/cuenta', (r) => (r.request().method() === 'DELETE' ? fallo(r, 403, 'codigo_mfa_invalido', 'El código no es válido') : r.fallback()));
    await page.goto('/#/cuenta/datos');
    const form = page.getByRole('form', { name: 'Eliminar tu cuenta' });
    await form.getByLabel('Tu contraseña').fill('una frase larga de prueba');
    await form.getByLabel('Código de 6 dígitos de tu app').fill('555555');
    await form.getByLabel('Entiendo que no se puede deshacer').check();
    await form.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
    await expect(form.getByLabel('Código de 6 dígitos de tu app')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/#\/cuenta\/datos$/);
  });
});

// ─── Administración ───────────────────────────────────────────────────────────────

const INVITACIONES = /^.*\/api\/admin\/invitaciones(\?.*)?$/;

/** @param {number} n @param {number} [desde] */
const pendientes = (n, desde = 0) =>
  Array.from({ length: n }, (_, i) => ({
    usuarioId: `00000000-0000-4000-8000-${String(100 + desde + i).padStart(12, '0')}`,
    nombre: `Persona Ficticia ${String(desde + i + 1)}`,
    correo: `persona${String(desde + i + 1)}@example.com`,
    rol: /** @type {const} */ ('lector'),
    expiraEn: '2026-10-24T12:00:00.000Z',
    vencida: desde + i === 0,
  }));

test.describe('administración', () => {
  test('lista paginada: 25 pendientes en dos páginas; una vencida lo dice con texto', async ({ page }) => {
    await conSesion(page, 'admin');
    const listado = await api(page, INVITACIONES, (r) => {
      const desde = Number(new URL(r.request().url()).searchParams.get('desde'));
      return json(r, { total: 25, invitaciones: pendientes(desde === 0 ? 20 : 5, desde) });
    });
    await page.goto('/#/admin');
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Administración' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('1 a 20 de 25')).toBeVisible();
    await expect(page.getByText('Venció: hay que reenviarla')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Anteriores' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Siguientes' }).click();
    await expect(page.getByText('21 a 25 de 25')).toBeVisible();
    await expect(page.getByText('Persona Ficticia 25')).toBeVisible();
    expect(listado.map((l) => new URL(l.url).search)).toEqual(['?limite=20&desde=0', '?limite=20&desde=20']);
  });

  test('invitar: manda nombre, correo y rol; el correo en uso se marca en su campo', async ({ page }) => {
    await conSesion(page, 'admin');
    let intentos = 0;
    const llamadas = await api(page, INVITACIONES, (r) => {
      if (r.request().method() === 'GET') return json(r, { total: 0, invitaciones: [] });
      if (++intentos === 1) return fallo(r, 409, 'correo_en_uso', 'Ya existe una cuenta o invitación con ese correo');
      return json(r, { usuario: { id: ID.lector, nombre: 'Ana Ficticia', correo: 'ana@example.com', rol: 'editor', estado: 'pendiente' }, expiraEn: '2026-10-24T12:00:00.000Z', correoEnviado: true }, 201);
    });
    await page.goto('/#/admin');
    await expect(page.getByText('No hay invitaciones pendientes.')).toBeVisible();
    await page.getByLabel('Nombre').fill('Ana Ficticia');
    await page.getByLabel('Correo').fill('ana@example.com');
    await page.getByLabel('Permisos').selectOption('editor');
    await page.getByRole('button', { name: 'Enviar la invitación' }).click();
    await expect(page.getByLabel('Correo')).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Enviar la invitación' }).click();
    await expect(page.getByText('Listo: Invitamos a Ana Ficticia (ana@example.com).')).toBeVisible();
    await expect(page.getByLabel('Nombre')).toHaveValue('');
    expect(llamadas.filter((l) => l.metodo === 'POST').map((l) => l.cuerpo)).toEqual([
      { nombre: 'Ana Ficticia', correo: 'ana@example.com', rol: 'editor' },
      { nombre: 'Ana Ficticia', correo: 'ana@example.com', rol: 'editor' },
    ]);
  });

  test('si el correo no salió, se avisa (advertencia, no éxito)', async ({ page }) => {
    await conSesion(page, 'admin');
    await api(page, INVITACIONES, (r) =>
      r.request().method() === 'GET'
        ? json(r, { total: 0, invitaciones: [] })
        : json(r, { usuario: { id: ID.lector, nombre: 'Ana Ficticia', correo: 'ana@example.com', rol: 'lector', estado: 'pendiente' }, expiraEn: '2026-10-24T12:00:00.000Z', correoEnviado: false }, 201),
    );
    await page.goto('/#/admin');
    await page.getByLabel('Nombre').fill('Ana Ficticia');
    await page.getByLabel('Correo').fill('ana@example.com');
    await page.getByRole('button', { name: 'Enviar la invitación' }).click();
    await expect(page.getByText(/^Atención: La invitación de Ana Ficticia .* el correo no se pudo enviar/)).toBeVisible();
  });

  test('reenviar y cancelar (con confirmación; "No" devuelve el foco)', async ({ page }) => {
    await conSesion(page, 'admin');
    let lista = pendientes(2);
    await api(page, INVITACIONES, (r) => json(r, { total: lista.length, invitaciones: lista }));
    const primera = lista[0]?.usuarioId ?? '';
    const reenvio = await api(page, `/admin/invitaciones/${primera}/reenviar`, (r) =>
      json(r, { usuario: { id: primera, nombre: 'Persona Ficticia 1', correo: 'persona1@example.com', rol: 'lector' }, expiraEn: '2026-10-25T12:00:00.000Z', correoEnviado: true }),
    );
    const cancelacion = await api(page, `/admin/invitaciones/${primera}`, (r) => {
      lista = lista.filter((i) => i.usuarioId !== primera);
      return r.fulfill({ status: 204 });
    });
    await page.goto('/#/admin');
    const fila = page.locator('.fila').filter({ hasText: 'Persona Ficticia 1' });
    await fila.getByRole('button', { name: 'Reenviar' }).click();
    await expect(fila.getByText('Listo: Reenviamos la invitación a Persona Ficticia 1 (persona1@example.com).')).toBeVisible();
    await expect(fila.getByText('Venció: hay que reenviarla')).toHaveCount(0);
    expect(reenvio.map((r) => r.metodo)).toEqual(['POST']);

    await fila.getByRole('button', { name: 'Cancelar la invitación' }).click();
    await expect(fila.getByText(/¿Cancelar la invitación de Persona Ficticia 1\?/)).toBeFocused();
    await fila.getByRole('button', { name: 'No' }).click();
    await expect(fila.getByRole('button', { name: 'Cancelar la invitación' })).toBeFocused();
    expect(cancelacion).toHaveLength(0);

    await fila.getByRole('button', { name: 'Cancelar la invitación' }).click();
    await fila.getByRole('button', { name: 'Sí, cancelarla' }).click();
    await expect(page.getByText('Listo: Cancelamos la invitación de Persona Ficticia 1.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Invitaciones pendientes' })).toBeFocused();
    await expect(page.locator('.fila')).toHaveCount(1);
    expect(cancelacion.map((c) => c.metodo)).toEqual(['DELETE']);
  });
});

// ─── Ancho de teléfono ────────────────────────────────────────────────────────────

test.describe('ancho de teléfono (360 px)', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('sin desplazamiento horizontal en la cuenta, las sesiones y la administración', async ({ page }) => {
    await conSesion(page, 'admin');
    await api(page, '/cuenta/sesiones', (r) => json(r, { sesiones: SESIONES }));
    await api(page, INVITACIONES, (r) => json(r, { total: 2, invitaciones: pendientes(2) }));
    for (const ruta of ['/cuenta', '/cuenta/sesiones', '/cuenta/datos', '/admin']) {
      await page.goto(`/#${ruta}`);
      await axeEstable(page);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra, ruta).toBe(0);
    }
  });
});

// ─── Accesibilidad ────────────────────────────────────────────────────────────────

for (const esquema of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`axe en la cuenta y la administración, tema ${esquema === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: esquema });

    test('perfil, foto con recorte, correo, contraseña con error, dos pasos, sesiones, datos con el 409', async ({ page }) => {
      await conSesion(page, 'lector', { avatar: { tipo: 'image/png', ancho: 64, alto: 64, hash: 'ef'.repeat(32) }, cambioCorreoPendiente: { correoNuevo: 'leo.nuevo@example.com', expiraEn: '2026-10-18T15:00:00.000Z' } });
      await api(page, `/usuarios/${ID.lector}/avatar`, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png(64, 64) }));
      await api(page, '/cuenta/sesiones', (r) => json(r, { sesiones: SESIONES }));
      await api(page, '/cuenta/mfa/iniciar', (r) => json(r, { secreto: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }));
      await api(page, '/cuenta/contrasena', (r) => fallo(r, 400, 'contrasena_debil', 'La contraseña no cumple la política', ['Es una contraseña muy común.']));
      await page.route('**/api/cuenta', (r) =>
        r.request().method() === 'DELETE'
          ? fallo(r, 409, 'propiedad_compartida', 'Transfiere la propiedad antes de eliminar la cuenta', [{ tipo: 'documento', id: '00000000-0000-4000-8000-000000000031', nombre: 'Guía ficticia' }])
          : r.fallback(),
      );

      await page.goto('/#/cuenta');
      await expect(page.getByRole('img', { name: 'Tu foto de perfil' })).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/cuenta/foto');
      await page.getByLabel('Elegir una imagen').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png(120, 90) });
      await expect(page.getByRole('img', { name: 'Vista previa del recorte' })).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/cuenta/correo');
      await page.getByRole('button', { name: 'Enviar el enlace' }).click();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/cuenta/contrasena');
      await page.getByLabel('Contraseña actual').fill('la frase actual de prueba');
      await page.getByLabel('Contraseña nueva', { exact: true }).fill('contraseña123456');
      await page.getByLabel('Repite la contraseña nueva').fill('contraseña123456');
      await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
      await expect(page.locator('.lista-errores')).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/cuenta/dos-pasos');
      await page.getByRole('button', { name: 'Activar la verificación en dos pasos' }).click();
      await expect(page.locator('.codigo-secreto')).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/cuenta/sesiones');
      await expect(page.getByText('Este dispositivo')).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/cuenta/datos');
      const form = page.getByRole('form', { name: 'Eliminar tu cuenta' });
      await form.getByLabel('Tu contraseña').fill('una frase larga de prueba');
      await form.getByLabel('Entiendo que no se puede deshacer').check();
      await form.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
      await expect(form.locator('.lista-errores li')).toHaveCount(1);
      expect(await axeEstable(page)).toEqual([]);
    });

    test('dos pasos activa, administración (con una confirmación abierta) y cuenta eliminada', async ({ page }) => {
      await conSesion(page, 'admin');
      await api(page, INVITACIONES, (r) => json(r, { total: 2, invitaciones: pendientes(2) }));
      await page.goto('/#/cuenta/dos-pasos');
      await expect(page.getByText('Listo: Está activa')).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/admin');
      await page.locator('.fila').first().getByRole('button', { name: 'Cancelar la invitación' }).click();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/cuenta-eliminada');
      expect(await axeEstable(page)).toEqual([]);
    });
  });
}
