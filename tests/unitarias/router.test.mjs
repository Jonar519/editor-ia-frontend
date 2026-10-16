import { describe, expect, it } from 'vitest';
import { decidir, resolver, rutaDelHash } from '../../src/router.js';
import { RUTAS } from '../../src/rutas.js';

describe('rutaDelHash', () => {
  it('normaliza el hash a un camino', () => {
    expect(rutaDelHash('')).toBe('/');
    expect(rutaDelHash('#')).toBe('/');
    expect(rutaDelHash('#/')).toBe('/');
    expect(rutaDelHash('#/documentos/')).toBe('/documentos');
    expect(rutaDelHash('#/documentos?orden=fecha')).toBe('/documentos');
  });

  it('un ancla de la página (#contenido) no es una ruta', () => {
    expect(rutaDelHash('#contenido')).toBeNull();
  });
});

describe('resolver', () => {
  it('rutas fijas y con parámetros (un segmento, decodificado)', () => {
    expect(resolver('/', RUTAS)?.ruta.patron).toBe('/');
    const r = resolver('/documentos/a%20b/editar', RUTAS);
    expect(r?.ruta.patron).toBe('/documentos/:id/editar');
    expect(r?.params).toEqual({ id: 'a b' });
  });

  it('nada coincide, o un parámetro mal codificado: null', () => {
    expect(resolver('/no-existe', RUTAS)).toBeNull();
    expect(resolver('/documentos/7/editar/de-mas', RUTAS)).toBeNull();
    expect(resolver('/documentos/%E0%A4%A/editar', RUTAS)).toBeNull();
  });
});

describe('decidir (guardia por rol)', () => {
  it('lo público se ve sin sesión', () => {
    expect(decidir('/', RUTAS, null).tipo).toBe('vista');
    expect(decidir('/entrar', RUTAS, null).tipo).toBe('vista');
  });

  it('sin sesión, lo protegido manda a entrar', () => {
    expect(decidir('/documentos', RUTAS, null).tipo).toBe('entrar');
    expect(decidir('/admin', RUTAS, null).tipo).toBe('entrar');
  });

  it('cada rol abre solo sus grupos', () => {
    expect(decidir('/documentos', RUTAS, { rol: 'lector' }).tipo).toBe('vista');
    expect(decidir('/documentos/1/editar', RUTAS, { rol: 'lector' }).tipo).toBe('sin_permiso');
    expect(decidir('/documentos/1/editar', RUTAS, { rol: 'editor' }).tipo).toBe('vista');
    expect(decidir('/admin', RUTAS, { rol: 'editor' }).tipo).toBe('sin_permiso');
    expect(decidir('/admin', RUTAS, { rol: 'admin' }).tipo).toBe('vista');
  });

  it('lo que no existe es "no encontrada", con o sin sesión', () => {
    expect(decidir('/no-existe', RUTAS, null).tipo).toBe('no_encontrada');
    expect(decidir('/no-existe', RUTAS, { rol: 'admin' }).tipo).toBe('no_encontrada');
  });
});
