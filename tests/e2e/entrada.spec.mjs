// Bloque I de punta a punta con el API SIMULADO: hero y su micro-interacción, entrar con y sin MFA,
// recuperación, completar invitación (admin con MFA y códigos de respaldo) y confirmar cambio de correo.
// El token de un enlace se comprueba DENTRO del manejador de cada petición: cuando la petición sale, la
// URL de la página ya no lo tiene. Las esperas de red se registran ANTES de la acción.
import { axeEstable, cuerpoError, expect, test } from './fixtures.mjs';

const TOKEN = 'TokenFicticioDePruebaParaElBloqueI_0123456789'.slice(0, 43);
const USUARIO = { id: '00000000-0000-4000-8000-000000000002', nombre: 'Rosa Ficticia', correo: 'rosa@example.com', rol: 'admin' };
const SESION = { accessToken: 'token-de-acceso-ficticio', expiraEn: Math.floor(Date.now() / 1000) + 900, usuario: USUARIO };
const CODIGOS = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'IIIII-JJJJJ', 'KKKKK-LLLLL', 'MMMMM-NNNNN', 'OOOOO-PPPPP', 'QQQQQ-RRRRR', 'SSSSS-TTTTT'];

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Route} Route */

const json = (/** @type {Route} */ r, /** @type {unknown} */ cuerpo, estado = 200, cabeceras = {}) =>
  r.fulfill({ status: estado, contentType: 'application/json', headers: cabeceras, body: JSON.stringify(cuerpo) });

/** Registra una ruta del API que además anota la URL de la página en el momento de la petición. */
async function api(/** @type {Page} */ page, /** @type {string} */ ruta, /** @type {(r: Route) => unknown} */ responder) {
  /** @type {{ url: string, cuerpo: any }[]} */
  const vistas = [];
  await page.route(`**/api${ruta}`, (r) => {
    vistas.push({ url: page.url(), cuerpo: r.request().postDataJSON() });
    return responder(r);
  });
  return vistas;
}

// ─── Hero ─────────────────────────────────────────────────────────────────────────

test.describe('hero', () => {
  test('qué es, una sola acción y una ilustración que dice que es de ejemplo', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Cuaderno' })).toBeFocused();
    await expect(page.getByText('Documentación técnica escrita en equipo.')).toBeVisible();
    await expect(page.locator('main .boton-primario')).toHaveCount(1);
    await expect(page.getByRole('figure', { name: 'Ilustración de ejemplo: no es un documento real.' })).toBeVisible();
    // Sin cifras: ningún dígito en el contenido del hero.
    expect(await page.locator('main').innerText()).not.toMatch(/\d/);
  });

  test('micro-interacción: "Otra persona" muestra la etiqueta, la anuncia y se maneja con el teclado', async ({ page }) => {
    await page.goto('/');
    const boton = page.getByRole('button', { name: 'Otra persona' });
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await boton.focus();
    await page.keyboard.press('Enter');
    await expect(boton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#etiqueta-otra-persona')).toBeVisible();
    await expect(page.locator('.ilustracion [aria-live="polite"]')).toHaveText('Otra persona está editando este párrafo');
    await page.keyboard.press('Space');
    await expect(boton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#etiqueta-otra-persona')).toBeHidden();
  });

  test('la etiqueta reutiliza la única animación ("aparecer"), y sin ella si se pide reducir el movimiento', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Otra persona' }).click();
    await expect(page.locator('#etiqueta-otra-persona')).toHaveCSS('animation-name', 'aparecer');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.getByRole('button', { name: 'Otra persona' }).click();
    await expect(page.locator('#etiqueta-otra-persona')).toHaveCSS('animation-name', 'none');
  });

  test('con sesión, el inicio lleva a los documentos', async ({ page }) => {
    await api(page, '/auth/refresco', (r) => json(r, SESION));
    await page.goto('/');
    await expect(page).toHaveURL(/#\/documentos$/);
  });
});

// ─── Entrar ───────────────────────────────────────────────────────────────────────

/** @param {Page} page */
async function llenarEntrar(page, correo = 'rosa@example.com', contrasena = 'una frase larga de prueba') {
  await page.getByLabel('Correo').fill(correo);
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('entrar', () => {
  test('credenciales incorrectas: el mensaje del servidor, con el foco en el error', async ({ page }) => {
    await api(page, '/auth/sesion', (r) => json(r, JSON.parse(cuerpoError('credenciales_invalidas', 'Correo o contraseña incorrectos')), 401));
    await page.goto('/#/entrar');
    await llenarEntrar(page);
    await expect(page.locator('.resumen-error')).toBeFocused();
    await expect(page.getByRole('alert')).toContainText('Error: Correo o contraseña incorrectos');
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'password');
  });

  test('cuenta bloqueada (429): dice cuánto esperar', async ({ page }) => {
    await api(page, '/auth/sesion', (r) => json(r, JSON.parse(cuerpoError('cuenta_bloqueada', 'Demasiados intentos fallidos. Espera antes de volver a intentar.')), 429, { 'retry-after': '60' }));
    await page.goto('/#/entrar');
    await llenarEntrar(page);
    await expect(page.getByRole('alert')).toContainText('Puedes volver a intentar en 60 s.');
  });

  test('sin MFA: entra y vuelve a la sección protegida que se quiso abrir', async ({ page }) => {
    await api(page, '/auth/sesion', (r) => json(r, { ...SESION, usuario: { ...USUARIO, rol: 'lector' } }, 201));
    await api(page, '/cuenta', (r) =>
      json(r, { ...USUARIO, rol: 'lector', telefono: null, mfaActivo: false, creadaEn: '2026-01-15T12:00:00.000Z', activadaEn: '2026-01-15T12:30:00.000Z', avatar: null, cambioCorreoPendiente: null }),
    );
    await page.goto('/#/cuenta');
    await expect(page).toHaveURL(/#\/entrar$/);
    await llenarEntrar(page);
    await expect(page).toHaveURL(/#\/cuenta$/);
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Salir' })).toBeVisible();
  });

  test('con MFA: segundo paso con el código de la app', async ({ page }) => {
    await api(page, '/auth/sesion', (r) => json(r, { mfaRequerido: true, desafio: TOKEN, metodos: ['totp', 'respaldo'], expiraEnSegundos: 300 }, 202));
    const mfa = await api(page, '/auth/mfa', (r) => json(r, SESION, 201));
    await page.goto('/#/entrar');
    await llenarEntrar(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Verificación en dos pasos' })).toBeFocused();
    await page.getByLabel('Código de 6 dígitos').fill('123 456');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page).toHaveURL(/#\/documentos$/);
    expect(mfa[0]?.cuerpo).toEqual({ desafio: TOKEN, codigo: '123456' });
  });

  test('con MFA: un código de respaldo se normaliza y se manda como codigoRespaldo', async ({ page }) => {
    await api(page, '/auth/sesion', (r) => json(r, { mfaRequerido: true, desafio: TOKEN, metodos: ['totp', 'respaldo'], expiraEnSegundos: 300 }, 202));
    const mfa = await api(page, '/auth/mfa', (r) => json(r, SESION, 201));
    await page.goto('/#/entrar');
    await llenarEntrar(page);
    await page.getByRole('button', { name: 'Usar un código de respaldo' }).click();
    await page.getByLabel('Código de respaldo').fill('aaaaa bbbbb');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page).toHaveURL(/#\/documentos$/);
    expect(mfa[0]?.cuerpo).toEqual({ desafio: TOKEN, codigoRespaldo: 'AAAAA-BBBBB' });
  });

  test('con MFA: un código incorrecto (desafío ya consumido) vuelve a empezar con el correo escrito', async ({ page }) => {
    await api(page, '/auth/sesion', (r) => json(r, { mfaRequerido: true, desafio: TOKEN, metodos: ['totp', 'respaldo'], expiraEnSegundos: 300 }, 202));
    await api(page, '/auth/mfa', (r) => json(r, JSON.parse(cuerpoError('mfa_invalido', 'El código no es válido o el paso venció. Inicia sesión de nuevo.')), 401));
    await page.goto('/#/entrar');
    await llenarEntrar(page);
    await page.getByLabel('Código de 6 dígitos').fill('000000');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeFocused();
    await expect(page.getByRole('alert')).toContainText('El código no es válido o el paso venció.');
    await expect(page.getByLabel('Correo')).toHaveValue('rosa@example.com');
  });

  test('salir: cierra la sesión en el servidor y vuelve al inicio', async ({ page }) => {
    await api(page, '/auth/refresco', (r) => json(r, SESION));
    const cierre = await api(page, '/auth/sesion', (r) => r.fulfill({ status: 204 }));
    await page.goto('/#/documentos');
    await page.unroute('**/api/auth/refresco');
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('link', { name: 'Entrar' }).first()).toBeVisible();
    expect(cierre).toHaveLength(1);
  });
});

// ─── Recuperación ─────────────────────────────────────────────────────────────────

test.describe('recuperación', () => {
  test('pedir el enlace: la misma respuesta exista o no el correo', async ({ page }) => {
    const MENSAJE = 'Si el correo corresponde a una cuenta, te enviamos un enlace para restablecer la contraseña.';
    await api(page, '/auth/recuperacion', (r) => json(r, { mensaje: MENSAJE }, 202));
    await page.goto('/#/recuperar');
    await page.getByLabel('Correo de tu cuenta').fill('nadie@example.com');
    await page.getByRole('button', { name: 'Enviar el enlace' }).click();
    await expect(page.getByRole('status').filter({ hasText: MENSAJE })).toBeVisible();
  });

  test('el token sale de la URL ANTES de cualquier petición; política y éxito', async ({ page }) => {
    let intento = 0;
    const completar = await api(page, '/auth/recuperacion/completar', (r) =>
      ++intento === 1 ? json(r, { error: { codigo: 'contrasena_debil', mensaje: 'La contraseña no cumple la política', solicitud: 'x', detalles: ['es demasiado común'] } }, 400) : r.fulfill({ status: 204 }),
    );
    await page.goto(`/#/recuperar/${TOKEN}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Elegir una contraseña nueva' })).toBeVisible();
    expect(page.url()).not.toContain(TOKEN);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('una frase larga y común');
    await page.getByLabel('Repite la contraseña nueva').fill('una frase larga y común');
    await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await expect(page.getByRole('alert')).toContainText('La contraseña no cumple la política');
    await expect(page.getByText('es demasiado común')).toBeVisible();
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('otra frase larga distinta');
    await page.getByLabel('Repite la contraseña nueva').fill('otra frase larga distinta');
    await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await expect(page.getByText('Tu contraseña cambió y se cerraron todas tus sesiones.')).toBeVisible();
    expect(completar.map((c) => c.cuerpo.token)).toEqual([TOKEN, TOKEN]); // el token viaja en el CUERPO…
    for (const c of completar) expect(c.url).not.toContain(TOKEN); // …y nunca estuvo en la URL al pedir
  });

  test('las dos contraseñas no coinciden: se dice en el campo, sin llamar al servidor', async ({ page }) => {
    const completar = await api(page, '/auth/recuperacion/completar', (r) => r.fulfill({ status: 204 }));
    await page.goto(`/#/recuperar/${TOKEN}`);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill('una frase larga de prueba');
    await page.getByLabel('Repite la contraseña nueva').fill('otra frase distinta');
    await page.getByRole('button', { name: 'Guardar la contraseña' }).click();
    await expect(page.getByText('Las dos contraseñas no coinciden.')).toBeVisible();
    await expect(page.getByLabel('Repite la contraseña nueva')).toHaveAttribute('aria-invalid', 'true');
    expect(completar).toHaveLength(0);
  });
});

// ─── Invitación ───────────────────────────────────────────────────────────────────

const INVITACION = { nombre: 'Rosa Ficticia', correo: 'rosa@example.com', expiraEn: '2026-12-31T00:00:00.000Z' };

test.describe('completar invitación', () => {
  test('editor: el token sale de la URL antes de consultar; crea la cuenta y entra', async ({ page }) => {
    const consultar = await api(page, '/invitaciones/consultar', (r) => json(r, { ...INVITACION, rol: 'editor', requiereMfa: false }));
    const completar = await api(page, '/invitaciones/completar', (r) => json(r, { ...SESION, usuario: { ...USUARIO, rol: 'editor' } }, 201));
    await page.goto(`/#/invitacion/${TOKEN}`);
    await expect(page.getByText('Hola, Rosa Ficticia. Te invitaron con permisos de edición.')).toBeVisible();
    expect(consultar[0]?.url).not.toContain(TOKEN);
    expect(consultar[0]?.cuerpo).toEqual({ token: TOKEN });
    await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga de prueba');
    await page.getByLabel('Repite la contraseña').fill('una frase larga de prueba');
    await page.getByRole('button', { name: 'Crear la cuenta' }).click();
    await expect(page).toHaveURL(/#\/documentos$/);
    expect(completar[0]?.cuerpo).toEqual({ token: TOKEN, contrasena: 'una frase larga de prueba' });
  });

  test('admin: secreto MFA, primer código y códigos de respaldo que NO se borran al abrir la sesión', async ({ page }) => {
    await api(page, '/invitaciones/consultar', (r) => json(r, { ...INVITACION, rol: 'admin', requiereMfa: true }));
    const mfa = await api(page, '/invitaciones/mfa', (r) => json(r, { secreto: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Cuaderno:rosa%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Cuaderno' }));
    const completar = await api(page, '/invitaciones/completar', (r) => json(r, { ...SESION, codigosRespaldo: CODIGOS }, 201));
    await page.goto(`/#/invitacion/${TOKEN}`);
    await expect(page.locator('.codigo-secreto')).toHaveText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP');
    expect(mfa[0]?.url).not.toContain(TOKEN);
    await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga de prueba');
    await page.getByLabel('Repite la contraseña').fill('una frase larga de prueba');
    await page.getByLabel('Primer código de 6 dígitos').fill('654321');
    await page.getByRole('button', { name: 'Crear la cuenta' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Guarda tus códigos de respaldo' })).toBeFocused();
    expect(completar[0]?.cuerpo).toEqual({ token: TOKEN, contrasena: 'una frase larga de prueba', codigoTotp: '654321' });
    // La sesión ya se abrió (la navegación lo muestra) y los códigos SIGUEN en pantalla.
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Códigos de respaldo' }).getByRole('listitem')).toHaveCount(10);
    const continuar = page.getByRole('button', { name: 'Continuar' });
    await expect(continuar).toBeDisabled();
    await page.getByLabel('Ya los guardé en un lugar seguro').check();
    await continuar.click();
    await expect(page).toHaveURL(/#\/documentos$/);
  });

  test('admin: un primer código incorrecto se marca en el campo', async ({ page }) => {
    await api(page, '/invitaciones/consultar', (r) => json(r, { ...INVITACION, rol: 'admin', requiereMfa: true }));
    await api(page, '/invitaciones/mfa', (r) => json(r, { secreto: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }));
    await api(page, '/invitaciones/completar', (r) => json(r, JSON.parse(cuerpoError('codigo_mfa_invalido', 'El código no es válido')), 400));
    await page.goto(`/#/invitacion/${TOKEN}`);
    await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga de prueba');
    await page.getByLabel('Repite la contraseña').fill('una frase larga de prueba');
    await page.getByLabel('Primer código de 6 dígitos').fill('000000');
    await page.getByRole('button', { name: 'Crear la cuenta' }).click();
    await expect(page.getByLabel('Primer código de 6 dígitos')).toHaveAttribute('aria-invalid', 'true');
  });

  test('una invitación vencida o usada: el mensaje del servidor y "Reintentar" sin recargar', async ({ page }) => {
    await api(page, '/invitaciones/consultar', (r) => json(r, JSON.parse(cuerpoError('invitacion_vencida', 'El enlace venció. Pide una nueva invitación.')), 410));
    await page.goto(`/#/invitacion/${TOKEN}`);
    await expect(page.getByRole('alert')).toContainText('El enlace venció. Pide una nueva invitación.');
    expect(page.url()).not.toContain(TOKEN);
  });
});

// ─── Cambio de correo ─────────────────────────────────────────────────────────────

test.describe('confirmar cambio de correo', () => {
  test('no se confirma solo al abrir: hace falta el botón; el token ya no está en la URL', async ({ page }) => {
    const confirmar = await api(page, '/cuenta/correo/confirmar', (r) => r.fulfill({ status: 204 }));
    await page.goto(`/#/correo/${TOKEN}`);
    await expect(page.getByRole('button', { name: 'Confirmar el cambio' })).toBeVisible();
    expect(page.url()).not.toContain(TOKEN);
    expect(confirmar).toHaveLength(0);
    await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
    await expect(page.getByText('Tu correo cambió. Desde ahora entra con la dirección nueva.')).toBeVisible();
    expect(confirmar).toHaveLength(1);
    expect(confirmar[0]?.cuerpo).toEqual({ token: TOKEN });
    expect(confirmar[0]?.url).not.toContain(TOKEN);
  });
});

// ─── Accesibilidad ────────────────────────────────────────────────────────────────

for (const esquema of /** @type {const} */ (['light', 'dark'])) {
  test.describe(`axe en las pantallas de entrada, tema ${esquema === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: esquema });

    test('hero (con la etiqueta abierta), entrar, segundo paso, recuperar, invitación y códigos', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Otra persona' }).click();
      expect(await axeEstable(page)).toEqual([]);

      await api(page, '/auth/sesion', (r) => json(r, { mfaRequerido: true, desafio: TOKEN, metodos: ['totp', 'respaldo'], expiraEnSegundos: 300 }, 202));
      await page.goto('/#/entrar');
      expect(await axeEstable(page)).toEqual([]);
      await llenarEntrar(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Verificación en dos pasos' })).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);

      await page.goto('/#/recuperar');
      expect(await axeEstable(page)).toEqual([]);

      await api(page, '/invitaciones/consultar', (r) => json(r, { ...INVITACION, rol: 'admin', requiereMfa: true }));
      await api(page, '/invitaciones/mfa', (r) => json(r, { secreto: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }));
      await api(page, '/invitaciones/completar', (r) => json(r, { ...SESION, codigosRespaldo: CODIGOS }, 201));
      await page.goto(`/#/invitacion/${TOKEN}`);
      await expect(page.locator('.codigo-secreto')).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);
      await page.getByLabel('Contraseña', { exact: true }).fill('una frase larga de prueba');
      await page.getByLabel('Repite la contraseña').fill('una frase larga de prueba');
      await page.getByLabel('Primer código de 6 dígitos').fill('654321');
      await page.getByRole('button', { name: 'Crear la cuenta' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Guarda tus códigos de respaldo' })).toBeVisible();
      expect(await axeEstable(page)).toEqual([]);
    });
  });
}
