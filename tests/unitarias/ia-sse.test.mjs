// Lector SSE de resumir y mejorar (bloque Q) y mensajes de error de la IA, sin navegador.
import { describe, expect, it } from 'vitest';
import { ErrorApi } from '../../src/api/errores.js';
import { horaLocal, mensajeIa } from '../../src/diferidas/ia-mensajes.js';
import { crearLectorSse, leerSse } from '../../src/diferidas/ia-sse.js';

/** Un cuerpo de respuesta que entrega exactamente estos trozos de bytes. */
function cuerpo(/** @type {Uint8Array[]} */ trozos) {
  return new ReadableStream({
    start(c) {
      for (const t of trozos) c.enqueue(t);
      c.close();
    },
  });
}
const bytes = (/** @type {string} */ s) => new TextEncoder().encode(s);

describe('crearLectorSse', () => {
  it('arma un evento cortado entre trozos solo cuando llega la línea en blanco que lo cierra', () => {
    const l = crearLectorSse();
    expect(l.empujar('event: fragm')).toEqual([]);
    expect(l.empujar('ento\ndata: {"texto":"Ho')).toEqual([]);
    expect(l.pendiente()).toBe(true);
    expect(l.empujar('la"}\n\n')).toEqual([{ evento: 'fragmento', datos: { texto: 'Hola' } }]);
    expect(l.pendiente()).toBe(false);
  });

  it('ignora los latidos (": latido"), acepta CRLF y varias líneas data', () => {
    const l = crearLectorSse();
    const eventos = l.empujar(': latido\r\n\r\nevent: fin\r\ndata: {"tokensEntrada":1,\r\ndata: "tokensSalida":2}\r\n\r\n');
    expect(eventos).toEqual([{ evento: 'fin', datos: { tokensEntrada: 1, tokensSalida: 2 } }]);
  });

  it('varios eventos en un mismo trozo, en orden', () => {
    const l = crearLectorSse();
    const e = l.empujar('event: fragmento\ndata: {"texto":"a"}\n\nevent: fragmento\ndata: {"texto":"b"}\n\nevent: error\ndata: {"codigo":"ia_saturada","mensaje":"x"}\n\n');
    expect(e.map((x) => x.evento)).toEqual(['fragmento', 'fragmento', 'error']);
  });
});

describe('leerSse', () => {
  it('una letra con tilde cortada entre dos trozos de red se arma bien', async () => {
    const todo = bytes('event: fragmento\ndata: {"texto":"canción"}\n\n');
    const corte = todo.indexOf(0xc3) + 1; // a la mitad de la "ó" (dos bytes en UTF-8)
    /** @type {unknown[]} */
    const vistos = [];
    const r = await leerSse(cuerpo([todo.slice(0, corte), todo.slice(corte)]), (e) => vistos.push(e.datos));
    expect(vistos).toEqual([{ texto: 'canción' }]);
    expect(r.completa).toBe(true);
  });

  it('una corriente cortada a mitad de evento se informa como incompleta', async () => {
    const r = await leerSse(cuerpo([bytes('event: fragmento\ndata: {"texto":"a"}\n\nevent: fragmento\ndata: {"tex')]), () => {});
    expect(r.completa).toBe(false);
  });
});

describe('mensajes de error de la IA', () => {
  const error = (/** @type {string} */ codigo, /** @type {number} */ estado, /** @type {number | undefined} */ reintentarEnSegundos = undefined) =>
    new ErrorApi({ estado, codigo, mensaje: 'x', reintentarEnSegundos });

  it('tope diario: dice a qué hora (local) se renueva', () => {
    const ahora = Date.UTC(2026, 9, 24, 10, 0, 0);
    const m = mensajeIa(error('tope_diario_ia', 429, 3600), ahora);
    expect(m).toBe(`Llegaste al uso diario de la IA. Se renueva a las ${horaLocal(3600, ahora)}.`);
    expect(horaLocal(3600, ahora)).toMatch(/^\d\d:\d\d$/);
  });

  it('horaLocal suma los segundos a la hora local de la persona', () => {
    const ahora = new Date(2026, 9, 24, 23, 50, 0).getTime();
    expect(horaLocal(15 * 60, ahora)).toBe('00:05');
  });

  it('saturada con Retry-After dice cuántos segundos esperar', () => {
    expect(mensajeIa(error('ia_saturada', 429, 7))).toBe('La IA está saturada. Vuelve a intentar en 7 s.');
  });

  it('los códigos del SSE (sin ErrorApi) también se traducen', () => {
    expect(mensajeIa({ codigo: 'ia_tiempo_agotado', mensaje: 'x' })).toBe('La IA tardó demasiado en responder. Inténtalo de nuevo.');
    expect(mensajeIa({ codigo: 'ia_no_disponible' })).toBe('La IA no está disponible en este momento. Inténtalo más tarde.');
    expect(mensajeIa(null)).toBe('La IA tuvo un problema. Inténtalo de nuevo.');
  });

  it('un error del API que no es de IA usa el mensaje general', () => {
    expect(mensajeIa(error('sin_permiso', 403))).toBe('Tu permiso no alcanza para esta acción de IA.');
    expect(mensajeIa(error('no_encontrado', 404))).not.toMatch(/IA/);
  });
});
