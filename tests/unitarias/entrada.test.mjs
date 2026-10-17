// Piezas puras del bloque I: borrar el token de la URL, no redibujar al cambiar la sesión, validar
// contraseñas y códigos, y el destino después de entrar.
import { describe, expect, it } from 'vitest';
import { debeRedibujar } from '../../src/router.js';
import { RUTAS } from '../../src/rutas.js';
import { recordarDestino, tomarDestino } from '../../src/sesion.js';
import { consumirToken } from '../../src/token-url.js';
import { normalizarCodigo, normalizarCodigoRespaldo, problemaContrasenaNueva } from '../../src/validacion.js';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJK012345'.slice(0, 43);

/** Historia falsa que registra cada replaceState. */
const ventanaFalsa = () => {
  /** @type {string[]} */
  const reemplazos = [];
  return { reemplazos, ventana: { history: { replaceState: (/** @type {unknown} */ _e, /** @type {string} */ _t, /** @type {string} */ url) => reemplazos.push(url) } } };
};

describe('consumirToken: el token sale de la URL en cuanto se lee', () => {
  it('lo reemplaza por la ruta base y devuelve el token', () => {
    const { reemplazos, ventana } = ventanaFalsa();
    expect(consumirToken(TOKEN, '#/invitacion', ventana)).toBe(TOKEN);
    expect(reemplazos).toEqual(['#/invitacion']);
  });

  it('lo borra TAMBIÉN si no es válido (y entonces devuelve null)', () => {
    const { reemplazos, ventana } = ventanaFalsa();
    expect(consumirToken('corto', '#/recuperar', ventana)).toBeNull();
    expect(consumirToken(undefined, '#/correo', ventana)).toBeNull();
    expect(consumirToken(`${TOKEN}=`, '#/correo', ventana)).toBeNull();
    expect(reemplazos).toEqual(['#/recuperar', '#/correo', '#/correo']);
  });
});

describe('debeRedibujar al cambiar la sesión', () => {
  const ruta = (/** @type {string} */ patron) => {
    const r = RUTAS.find((x) => x.patron === patron);
    if (!r) throw new Error(patron);
    return r;
  };
  const vista = (/** @type {string} */ patron) => ({ tipo: /** @type {const} */ ('vista'), ruta: ruta(patron), params: {} });
  const mostrada = (/** @type {string} */ patron) => ({ tipo: /** @type {const} */ ('vista'), patron, grupo: ruta(patron).grupo });

  it('la MISMA vista no se redibuja (los códigos de respaldo no se borran al abrir la sesión)', () => {
    expect(debeRedibujar(mostrada('/invitacion/:token'), vista('/invitacion/:token'))).toBe(false);
    // También una protegida: renovar el token o reconfirmar el mismo rol no borra lo que hay en pantalla.
    expect(debeRedibujar(mostrada('/cuenta'), vista('/cuenta'))).toBe(false);
  });

  it('una vista pública que sigue siendo pública no se redibuja aunque su patrón cambie (token borrado)', () => {
    expect(debeRedibujar(mostrada('/recuperar/:token'), vista('/recuperar'))).toBe(false);
  });

  it('se redibuja si cambia lo que corresponde mostrar', () => {
    expect(debeRedibujar(mostrada('/cuenta'), { tipo: 'entrar' })).toBe(true);
    expect(debeRedibujar(mostrada('/documentos'), vista('/cuenta'))).toBe(true);
    expect(debeRedibujar({ tipo: 'sin_permiso' }, vista('/admin'))).toBe(true);
    expect(debeRedibujar(null, vista('/'))).toBe(true);
  });
});

describe('validación previa', () => {
  it('contraseña nueva: 12 a 128 caracteres (contados como caracteres, no bytes) y que coincidan', () => {
    expect(problemaContrasenaNueva('once-caract', 'once-caract')?.campo).toBe('nueva');
    expect(problemaContrasenaNueva('ñandú ñandú ', 'ñandú ñandú ')).toBeNull(); // 12 caracteres
    expect(problemaContrasenaNueva('x'.repeat(129), 'x'.repeat(129))?.campo).toBe('nueva');
    expect(problemaContrasenaNueva('una frase larga', 'una frase larg')?.campo).toBe('confirmacion');
  });

  it('código TOTP: 6 dígitos, se aceptan espacios al pegarlo', () => {
    expect(normalizarCodigo('123 456')).toBe('123456');
    expect(normalizarCodigo('12345')).toBeNull();
    expect(normalizarCodigo('12345a')).toBeNull();
  });

  it('código de respaldo: XXXXX-XXXXX, en mayúsculas, con o sin guion', () => {
    expect(normalizarCodigoRespaldo('zegib h56bd')).toBe('ZEGIB-H56BD');
    expect(normalizarCodigoRespaldo('ZEGIB-H56BD')).toBe('ZEGIB-H56BD');
    expect(normalizarCodigoRespaldo('ZEGIB-H56B')).toBeNull();
  });
});

describe('destino después de entrar', () => {
  it('vuelve a la sección protegida que se quiso abrir; solo una vez', () => {
    recordarDestino('/cuenta');
    expect(tomarDestino()).toBe('/cuenta');
    expect(tomarDestino()).toBe('/documentos');
  });

  it('solo caminos internos: nunca una URL ni volver a "entrar"', () => {
    for (const malo of ['//evil.example.com', 'https://evil.example.com', '/entrar', 'javascript:alert(1)', '']) {
      recordarDestino(malo);
      expect(tomarDestino()).toBe('/documentos');
    }
  });
});
