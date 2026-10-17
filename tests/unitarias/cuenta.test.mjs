// Piezas puras del bloque J: validación del perfil, recorte del avatar, la lista del 409 al eliminar la
// cuenta, la paginación de invitaciones, los textos de resultado y el marcado de la sección activa.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { erroresEnCampos } from '../../src/componentes/formulario.js';
import {
  bloqueosDeEliminacion,
  normalizarTelefono,
  pagina,
  problemaNombre,
  recorteCuadrado,
  tipoDeSalida,
  ZOOM_MAXIMO,
} from '../../src/reglas-cuenta.js';
import { enSeccion } from '../../src/router.js';
import { RUTAS } from '../../src/rutas.js';
import { POR_PAGINA, textoEnviada } from '../../src/vistas/admin/panel.js';
import { textoCerradas } from '../../src/vistas/lector/contrasena.js';
import { SECCIONES } from '../../src/vistas/lector/comun.js';

describe('perfil: validación previa', () => {
  it('nombre: 1 a 80 caracteres sin contar los espacios de los extremos', () => {
    expect(problemaNombre('   ')).not.toBeNull();
    expect(problemaNombre(' Ana ')).toBeNull();
    expect(problemaNombre('x'.repeat(80))).toBeNull();
    expect(problemaNombre(` ${'x'.repeat(80)} `)).toBeNull();
    expect(problemaNombre('x'.repeat(81))).not.toBeNull();
  });

  it('teléfono: E.164 (+ y 7 a 15 dígitos, sin 0 inicial); se aceptan separadores; vacío lo quita', () => {
    expect(normalizarTelefono('+1 555 010-0123')).toEqual({ valor: '+15550100123' });
    expect(normalizarTelefono('+1 (555) 010.0000')).toEqual({ valor: '+15550100000' });
    expect(normalizarTelefono('  ')).toEqual({ valor: null });
    expect(normalizarTelefono('+1234567')).toEqual({ valor: '+1234567' }); // 7 dígitos
    expect(normalizarTelefono('+123456')).toHaveProperty('problema'); // 6
    expect(normalizarTelefono(`+1${'2'.repeat(14)}`)).toHaveProperty('valor'); // 15
    expect(normalizarTelefono(`+1${'2'.repeat(15)}`)).toHaveProperty('problema'); // 16
    expect(normalizarTelefono('+0123456789')).toHaveProperty('problema');
    expect(normalizarTelefono('5550100123')).toHaveProperty('problema'); // sin +
    expect(normalizarTelefono('+1 555 abc')).toHaveProperty('problema');
  });
});

describe('avatar: recorte cuadrado en el cliente', () => {
  it('zoom 1 centrado: el cuadrado más grande que cabe, en el centro', () => {
    expect(recorteCuadrado(300, 200, { zoom: 1, x: 0.5, y: 0.5 })).toEqual({ sx: 50, sy: 0, lado: 200 });
    expect(recorteCuadrado(200, 300, { zoom: 1, x: 0.5, y: 0.5 })).toEqual({ sx: 0, sy: 50, lado: 200 });
  });

  it('x e y recorren el espacio que sobra de un borde al otro', () => {
    expect(recorteCuadrado(300, 200, { zoom: 1, x: 0, y: 0 })).toEqual({ sx: 0, sy: 0, lado: 200 });
    expect(recorteCuadrado(300, 200, { zoom: 1, x: 1, y: 1 })).toEqual({ sx: 100, sy: 0, lado: 200 });
    expect(recorteCuadrado(300, 200, { zoom: 2, x: 1, y: 1 })).toEqual({ sx: 200, sy: 100, lado: 100 });
  });

  it('el zoom achica el cuadrado; fuera de rango se limita (1 a ZOOM_MAXIMO)', () => {
    expect(recorteCuadrado(400, 400, { zoom: 2, x: 0.5, y: 0.5 })).toEqual({ sx: 100, sy: 100, lado: 200 });
    expect(recorteCuadrado(400, 400, { zoom: 0.2, x: 0.5, y: 0.5 }).lado).toBe(400);
    expect(recorteCuadrado(400, 400, { zoom: 99, x: 0.5, y: 0.5 }).lado).toBe(400 / ZOOM_MAXIMO);
    expect(recorteCuadrado(400, 400, { zoom: Number.NaN, x: 0.5, y: 0.5 }).lado).toBe(400);
  });

  it('el cuadrado NUNCA sale de la imagen (cualquier tamaño, zoom y posición, también fuera de rango)', () => {
    for (const [ancho, alto] of /** @type {[number, number][]} */ ([[1, 1], [3, 7], [641, 480], [4000, 3]])) {
      for (const zoom of [1, 1.37, 2.5, ZOOM_MAXIMO, 9]) {
        for (const x of [-1, 0, 0.33, 0.5, 1, 2]) {
          for (const y of [-1, 0, 0.71, 1, 2]) {
            const r = recorteCuadrado(ancho, alto, { zoom, x, y });
            expect(r.lado).toBeGreaterThanOrEqual(1);
            expect(r.sx).toBeGreaterThanOrEqual(0);
            expect(r.sy).toBeGreaterThanOrEqual(0);
            expect(r.sx + r.lado).toBeLessThanOrEqual(ancho);
            expect(r.sy + r.lado).toBeLessThanOrEqual(alto);
          }
        }
      }
    }
  });

  it('solo JPEG y PNG; un PNG sigue siendo PNG (la transparencia no se vuelve negra)', () => {
    expect(tipoDeSalida('image/png')).toBe('image/png');
    expect(tipoDeSalida('image/jpeg')).toBe('image/jpeg');
    expect(tipoDeSalida('image/gif')).toBeNull();
    expect(tipoDeSalida('image/svg+xml')).toBeNull();
    expect(tipoDeSalida('')).toBeNull();
  });
});

describe('eliminar la cuenta: la lista del 409', () => {
  const doc = { tipo: 'documento', id: '00000000-0000-4000-8000-000000000010', nombre: 'Guía de despliegue' };
  const esp = { tipo: 'espacio', id: '00000000-0000-4000-8000-000000000011', nombre: 'Equipo ficticio' };

  it('devuelve lo que hay que transferir', () => {
    expect(bloqueosDeEliminacion({ codigo: 'propiedad_compartida', detalles: [doc, esp] })).toEqual([doc, esp]);
  });

  it('descarta entradas con otra forma y otros errores', () => {
    expect(bloqueosDeEliminacion({ codigo: 'propiedad_compartida', detalles: [doc, { tipo: 'otro', id: 'x', nombre: 'y' }, null, 'texto', { tipo: 'espacio', id: 3, nombre: 'z' }] })).toEqual([doc]);
    expect(bloqueosDeEliminacion({ codigo: 'contrasena_incorrecta', detalles: [doc] })).toEqual([]);
    expect(bloqueosDeEliminacion({ codigo: 'propiedad_compartida' })).toEqual([]);
    expect(bloqueosDeEliminacion(null)).toEqual([]);
  });
});

describe('invitaciones: paginación y textos', () => {
  it('primera, del medio, última y vacía', () => {
    expect(pagina({ total: 45, limite: 20, desde: 0 })).toEqual({ primero: 1, ultimo: 20, anterior: null, siguiente: 20 });
    expect(pagina({ total: 45, limite: 20, desde: 20 })).toEqual({ primero: 21, ultimo: 40, anterior: 0, siguiente: 40 });
    expect(pagina({ total: 45, limite: 20, desde: 40 })).toEqual({ primero: 41, ultimo: 45, anterior: 20, siguiente: null });
    expect(pagina({ total: 40, limite: 20, desde: 20 })).toEqual({ primero: 21, ultimo: 40, anterior: 0, siguiente: null });
    expect(pagina({ total: 0, limite: 20, desde: 0 })).toEqual({ primero: 0, ultimo: 0, anterior: null, siguiente: null });
    expect(pagina({ total: 45, limite: 20, desde: 5 }).anterior).toBe(0); // nunca un "desde" negativo
    expect(POR_PAGINA).toBeLessThanOrEqual(200); // lo máximo que acepta el backend
  });

  it('si el correo no se pudo enviar, se dice y se ofrece reenviar', () => {
    const r = { usuario: { id: 'u', nombre: 'Leo Ficticio', correo: 'leo@example.com', rol: /** @type {const} */ ('editor') }, expiraEn: '2026-10-20T00:00:00.000Z', correoEnviado: true };
    expect(textoEnviada(r, 'invitar')).toBe('Invitamos a Leo Ficticio (leo@example.com).');
    expect(textoEnviada(r, 'reenviar')).toBe('Reenviamos la invitación a Leo Ficticio (leo@example.com).');
    expect(textoEnviada({ ...r, correoEnviado: false }, 'invitar')).toContain('el correo no se pudo enviar');
    expect(textoEnviada({ ...r, correoEnviado: false }, 'reenviar')).toContain('«Reenviar»');
  });

  it('contraseña cambiada: cuántas sesiones de otros dispositivos se cerraron', () => {
    expect(textoCerradas(0)).toContain('No había sesiones abiertas');
    expect(textoCerradas(1)).toContain('cerramos 1 sesión en');
    expect(textoCerradas(3)).toContain('cerramos 3 sesiones en');
  });
});

describe('errores de validación del servidor en su campo', () => {
  const falso = () => {
    /** @type {(string | null)[]} */
    const errores = [];
    let enfocado = false;
    const c = /** @type {any} */ ({ error: (/** @type {string | null} */ t) => errores.push(t), input: { focus: () => (enfocado = true) } });
    return { c, errores, enfocado: () => enfocado };
  };

  it('marca el campo de cada ruta y enfoca el primero', () => {
    const correo = falso();
    const nombre = falso();
    const err = { codigo: 'validacion', detalles: [{ ruta: 'correo', mensaje: 'correo inválido' }, { ruta: 'otra', mensaje: 'x' }] };
    expect(erroresEnCampos(err, { correo: correo.c, nombre: nombre.c })).toBe(true);
    expect(correo.errores).toEqual(['Correo inválido.']);
    expect(correo.enfocado()).toBe(true);
    expect(nombre.errores).toEqual([]);
  });

  it('otro error, o ninguna ruta conocida: no marca nada', () => {
    const correo = falso();
    expect(erroresEnCampos({ codigo: 'correo_en_uso', detalles: [{ ruta: 'correo', mensaje: 'x' }] }, { correo: correo.c })).toBe(false);
    expect(erroresEnCampos({ codigo: 'validacion', detalles: [{ ruta: 'rol', mensaje: 'x' }] }, { correo: correo.c })).toBe(false);
    expect(correo.errores).toEqual([]);
  });
});

describe('estilos', () => {
  it('hidden SIEMPRE oculta (una clase con display, como .boton, no le gana)', () => {
    const css = readFileSync(new URL('../../src/estilos/base.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });
});

describe('navegación', () => {
  it('la sección activa abarca sus subsecciones, por segmento completo', () => {
    expect(enSeccion('/cuenta/sesiones', '/cuenta')).toBe(true);
    expect(enSeccion('/cuenta', '/cuenta')).toBe(true);
    expect(enSeccion('/cuenta-eliminada', '/cuenta')).toBe(false);
    expect(enSeccion('/cuentas', '/cuenta')).toBe(false);
    expect(enSeccion('/documentos', '/')).toBe(false);
    expect(enSeccion('/', '/')).toBe(true);
  });

  it('cada sección de "Tu cuenta" tiene su ruta del grupo lector (todos los roles)', () => {
    for (const [camino] of SECCIONES) expect(RUTAS.find((r) => r.patron === camino)?.grupo).toBe('lector');
    expect(RUTAS.find((r) => r.patron === '/cuenta-eliminada')?.grupo).toBe('publico');
    expect(RUTAS.find((r) => r.patron === '/admin')?.grupo).toBe('admin');
  });
});
