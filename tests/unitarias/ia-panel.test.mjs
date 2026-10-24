// El panel de IA (bloque Q) y la búsqueda, con su código REAL sobre un document mínimo (dom-falso.mjs) y
// el API simulado. Reglas del diseño aprobado por escrito: Mejorar nunca se aplica solo, la salida de la
// IA va solo por el saneador, Detener aborta, quien lee no ve Mejorar ni las sugerencias, y los errores
// se muestran como error (no en violeta).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi } from '../../src/api/errores.js';
import { Elemento, instalarDom, porTexto, visible } from './dom-falso.mjs';

vi.mock('../../src/sesion.js', () => ({ api: { solicitar: vi.fn() } }));
const { api } = await import('../../src/sesion.js');
const { crearAnunciadorFrases, panelIa } = await import('../../src/diferidas/ia.js');
const { buscarEnEspacio } = await import('../../src/diferidas/ia-busqueda.js');

const solicitar = /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (api.solicitar));

/**
 * Una respuesta SSE como la del API. Con `abierta`, no termina: solo se corta si se aborta la señal
 * (como fetch).
 * @param {{ evento: string, datos: unknown }[]} eventos
 * @param {{ abierta?: boolean, senal?: AbortSignal }} [o]
 */
function respuestaSse(eventos, o = {}) {
  const texto = eventos.map((e) => `event: ${e.evento}\ndata: ${JSON.stringify(e.datos)}\n\n`).join('');
  const cuerpo = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(texto));
      if (!o.abierta) c.close();
      o.senal?.addEventListener('abort', () => c.error(new DOMException('abortada', 'AbortError')));
    },
  });
  return new Response(cuerpo, { headers: { 'content-type': 'text/event-stream' } });
}

const fragmentos = (/** @type {string[]} */ partes) => [
  ...partes.map((texto) => ({ evento: 'fragmento', datos: { texto } })),
  { evento: 'fin', datos: { tokensEntrada: 10, tokensSalida: 5 } },
];

/** El API simulado: `rutas` responde por ruta; /ia/uso siempre contesta. */
function simular(/** @type {Record<string, (cuerpo: any, senal?: AbortSignal) => unknown>} */ rutas) {
  solicitar.mockImplementation(async (/** @type {string} */ ruta, /** @type {any} */ op = {}) => {
    if (ruta === '/ia/uso') return { hoy: { peticiones: 3, tokensEntrada: 0, tokensSalida: 0 }, topes: { peticionesDia: 200, tokensDia: 1 }, renuevaEnSegundos: 60 };
    const f = rutas[ruta];
    if (!f) throw new Error(`ruta no simulada: ${ruta}`);
    return f(op.cuerpo, op.senal);
  });
}

/** @type {ReturnType<typeof instalarDom>} */
let dom;
beforeEach(() => {
  dom = instalarDom();
  solicitar.mockReset();
});
afterEach(() => dom.quitar());

const SELECCION = { desde: 0, hasta: 5, texto: 'Texto' };

/** @param {{ rol?: string, aplicar?: boolean, sugerencias?: any, seleccion?: any }} [o] */
function crear(o = {}) {
  let rol = o.rol ?? 'editor';
  const aplicar = { reemplazar: vi.fn(() => true), insertarDebajo: vi.fn() };
  const p = panelIa({
    documentoId: 'doc-1',
    rol: () => rol,
    texto: () => 'Texto del documento. Con dos frases.',
    seleccion: () => (o.seleccion === undefined ? SELECCION : o.seleccion),
    aplicar: o.aplicar === false ? undefined : aplicar,
    sugerencias: o.sugerencias,
    alCerrar: vi.fn(),
  });
  const el = /** @type {Elemento} */ (/** @type {unknown} */ (p.el));
  dom.body.append(el);
  p.abrir();
  return { p, el, aplicar, ponerRol: (/** @type {string} */ r) => ((rol = r), p.porRol()) };
}

const alertas = (/** @type {Elemento} */ el) => el.querySelectorAll('div').filter((d) => d.getAttribute('role') === 'alert');
const estado = (/** @type {Elemento} */ el) => /** @type {Elemento} */ (el.querySelector('.ia-estado')).textContent;
const respuesta = (/** @type {Elemento} */ el) => /** @type {Elemento} */ (el.querySelector('.ia-respuesta'));
const propuesta = (/** @type {Elemento} */ el) => /** @type {Elemento} */ (el.querySelector('.ia-propuesta'));
/** Deja correr las promesas y los temporizadores cortos. */
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('Mejorar: una propuesta que nunca se aplica sola', () => {
  it('al terminar, muestra la propuesta y NO toca el documento hasta que se elige', async () => {
    simular({ '/ia/mejorar': () => respuestaSse(fragmentos(['Texto ', 'mejorado.'])) });
    const { p, el, aplicar } = crear();
    await p.mejorar('breve');
    expect(solicitar).toHaveBeenCalledWith('/ia/mejorar', expect.objectContaining({ metodo: 'POST', corriente: true, cuerpo: { documentoId: 'doc-1', contenido: 'Texto', estilo: 'breve' } }));
    expect(visible(propuesta(el))).toBe(true);
    expect(respuesta(el).textContent).toContain('Texto mejorado.');
    expect(aplicar.reemplazar).not.toHaveBeenCalled();
    expect(aplicar.insertarDebajo).not.toHaveBeenCalled();
    porTexto(el, 'Reemplazar selección').click();
    expect(aplicar.reemplazar).toHaveBeenCalledWith(SELECCION, 'Texto mejorado.');
    expect(visible(propuesta(el))).toBe(false);
    expect(estado(el)).toBe('Se reemplazó la selección.');
  });

  it('Insertar debajo inserta; Descartar no toca nada', async () => {
    simular({ '/ia/mejorar': () => respuestaSse(fragmentos(['Otra versión.'])) });
    const { p, el, aplicar } = crear();
    await p.mejorar('claro');
    porTexto(el, 'Insertar debajo').click();
    expect(aplicar.insertarDebajo).toHaveBeenCalledWith(SELECCION, 'Otra versión.');
    await p.mejorar('claro');
    porTexto(el, 'Descartar').click();
    expect(aplicar.reemplazar).not.toHaveBeenCalled();
    expect(aplicar.insertarDebajo).toHaveBeenCalledTimes(1);
    expect(estado(el)).toBe('Propuesta descartada.');
  });

  it('si la selección cambió mientras la IA trabajaba, no reemplaza y lo dice', async () => {
    simular({ '/ia/mejorar': () => respuestaSse(fragmentos(['Nuevo.'])) });
    const { p, el, aplicar } = crear();
    aplicar.reemplazar.mockReturnValue(false);
    await p.mejorar('formal');
    porTexto(el, 'Reemplazar selección').click();
    expect(visible(propuesta(el))).toBe(true);
    expect(el.textContent).toContain('El texto seleccionado cambió mientras la IA trabajaba');
  });

  it('sin selección no se pide nada', async () => {
    simular({});
    const { p, el } = crear({ seleccion: null });
    await p.mejorar('claro');
    expect(solicitar).not.toHaveBeenCalledWith('/ia/mejorar', expect.anything());
    expect(el.textContent).toContain('Selecciona primero el texto que quieres mejorar.');
  });
});

describe('la salida de la IA es texto no confiable', () => {
  const MALICIOSA = '<img src=x onerror=alert(1)> **negrita** [enlace](javascript:alert(1)) <script>alert(2)</script>';

  it('se muestra solo con el saneador: sin HTML, sin on*, sin enlaces javascript:', async () => {
    simular({ '/ia/explicar': () => ({ texto: MALICIOSA }) });
    const { p, el } = crear();
    await p.explicar();
    const r = respuesta(el);
    expect(r.querySelectorAll('strong').map((s) => s.textContent)).toEqual(['negrita']);
    for (const e of r.todos()) {
      expect(['IMG', 'SCRIPT', 'IFRAME']).not.toContain(e.nodeName);
      for (const n of e.atributos.keys()) expect(n).not.toMatch(/^on/i);
      expect(e.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
    }
    expect(alertas(el)).toHaveLength(0);
  });

  it('lo mismo en streaming (resumir)', async () => {
    simular({ '/ia/resumir': () => respuestaSse(fragmentos(['<img src=x ', 'onerror=alert(1)> **ok**'])) });
    const { p, el } = crear();
    await p.resumir();
    const r = respuesta(el);
    expect(r.querySelectorAll('img')).toHaveLength(0);
    expect(r.querySelectorAll('strong').map((s) => s.textContent)).toEqual(['ok']);
  });
});

describe('Detener', () => {
  it('aborta el pedido en curso (el backend cancela la generación) y no lo trata como error', async () => {
    /** @type {AbortSignal | undefined} */
    let senalVista;
    simular({
      '/ia/resumir': (_c, senal) => {
        senalVista = senal;
        return respuestaSse([{ evento: 'fragmento', datos: { texto: 'Empieza…' } }], { abierta: true, senal });
      },
    });
    const { p, el } = crear();
    const enCurso = p.resumir();
    await esperar(10);
    const detener = porTexto(el, 'Detener');
    expect(visible(detener)).toBe(true);
    detener.click();
    await enCurso;
    expect(senalVista?.aborted).toBe(true);
    expect(estado(el)).toBe('Detenida.');
    expect(alertas(el)).toHaveLength(0);
    expect(visible(detener)).toBe(false);
  });
});

describe('errores de la IA', () => {
  it('un event: error del streaming se muestra como error, con su mensaje', async () => {
    simular({ '/ia/resumir': () => respuestaSse([{ evento: 'error', datos: { codigo: 'ia_tiempo_agotado', mensaje: 'x' } }]) });
    const { p, el } = crear();
    await p.resumir();
    expect(alertas(el).map((a) => a.textContent)).toEqual(['Error: La IA tardó demasiado en responder. Inténtalo de nuevo.']);
  });

  it('una corriente que se corta sin "fin" es un error, no una respuesta completa', async () => {
    simular({ '/ia/resumir': () => respuestaSse([{ evento: 'fragmento', datos: { texto: 'a medias' } }]) });
    const { p, el } = crear();
    await p.resumir();
    expect(alertas(el)).toHaveLength(1);
    expect(estado(el)).not.toBe('Listo.');
  });

  it('el tope diario (429) dice cuándo se renueva', async () => {
    simular({
      '/ia/explicar': () => {
        throw new ErrorApi({ estado: 429, codigo: 'tope_diario_ia', mensaje: 'x', reintentarEnSegundos: 3600 });
      },
    });
    const { p, el } = crear();
    await p.explicar();
    expect(alertas(el)[0]?.textContent).toMatch(/^Error: Llegaste al uso diario de la IA\. Se renueva a las \d\d:\d\d\.$/);
  });
});

describe('por rol', () => {
  it('quien lee ve Explicar y Resumir, pero no Mejorar, ni las sugerencias, ni el índice', () => {
    const { el } = crear({ rol: 'lector', sugerencias: { poner: vi.fn(async () => {}) } });
    expect(visible(porTexto(el, 'Explicar la selección'))).toBe(true);
    expect(visible(porTexto(el, 'Resumir el documento'))).toBe(true);
    expect(visible(porTexto(el, 'Mejorar la selección'))).toBe(false);
    expect(visible(/** @type {Elemento} */ (el.querySelector('#ia-sugerencias')))).toBe(false);
    expect(visible(porTexto(el, 'Actualizar índice de búsqueda'))).toBe(false);
  });

  it('quien edita los ve; si su permiso baja a lectura, se ocultan y las sugerencias se apagan', async () => {
    const poner = vi.fn(async () => {});
    const { el, ponerRol } = crear({ sugerencias: { poner } });
    expect(visible(porTexto(el, 'Mejorar la selección'))).toBe(true);
    const interruptor = /** @type {Elemento} */ (el.querySelector('#ia-sugerencias'));
    expect(visible(interruptor)).toBe(true);
    interruptor.checked = true;
    interruptor.disparar('change');
    expect(poner).toHaveBeenLastCalledWith(true, expect.any(Function));
    ponerRol('lector');
    expect(visible(porTexto(el, 'Mejorar la selección'))).toBe(false);
    expect(interruptor.checked).toBe(false);
    expect(poner).toHaveBeenLastCalledWith(false, expect.any(Function));
  });

  it('sin quien aplique (la lectura), no hay Mejorar aunque el rol permita escribir', () => {
    const { el } = crear({ aplicar: false });
    expect(visible(porTexto(el, 'Mejorar la selección'))).toBe(false);
  });
});

describe('sugerencias mientras se escribe', () => {
  it('desactivadas por defecto; el tope diario las apaga y lo dice como error', () => {
    const poner = vi.fn(async (/** @type {boolean} */ _si, /** @type {(codigo: string) => void} */ _alError) => {});
    const { el } = crear({ sugerencias: { poner } });
    const interruptor = /** @type {Elemento} */ (el.querySelector('#ia-sugerencias'));
    expect(interruptor.checked).toBe(false);
    expect(poner).not.toHaveBeenCalled();
    interruptor.checked = true;
    interruptor.disparar('change');
    const alError = /** @type {(c: string) => void} */ (poner.mock.calls[0]?.[1]);
    expect(alError).toBeTypeOf('function');
    alError('ia_saturada'); // una sugerencia lenta o saturada se ignora
    expect(interruptor.checked).toBe(true);
    alError('tope_diario_ia');
    expect(interruptor.checked).toBe(false);
    expect(poner).toHaveBeenLastCalledWith(false, expect.any(Function));
    expect(alertas(el)[0]?.textContent).toContain('Llegaste al uso diario de la IA');
  });

  it('si no se pudo cargar el autocompletado, el interruptor vuelve a apagado', async () => {
    const poner = vi.fn(async () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    const { el } = crear({ sugerencias: { poner } });
    const interruptor = /** @type {Elemento} */ (el.querySelector('#ia-sugerencias'));
    interruptor.checked = true;
    interruptor.disparar('change');
    await esperar();
    expect(interruptor.checked).toBe(false);
    expect(alertas(el)).toHaveLength(1);
  });
});

describe('anuncio del streaming por frases', () => {
  it('anuncia frases completas, a lo sumo cada 1,5 s, y al final lo que falte', () => {
    let t = 0;
    /** @type {string[]} */
    const dichos = [];
    const a = crearAnunciadorFrases((x) => dichos.push(x), () => t);
    a.avance('Primera frase. Segun');
    expect(dichos).toEqual(['Primera frase.']);
    t = 500;
    a.avance('Primera frase. Segunda frase. Ter');
    expect(dichos).toEqual(['Primera frase.']);
    t = 2000;
    a.avance('Primera frase. Segunda frase. Tercera');
    expect(dichos).toEqual(['Primera frase.', 'Segunda frase.']);
    a.fin('Primera frase. Segunda frase. Tercera');
    expect(dichos.at(-1)).toBe('Tercera Respuesta completa.');
  });
});

describe('búsqueda por significado', () => {
  it('pinta los resultados con su parecido, y el fragmento como TEXTO', async () => {
    simular({
      '/espacios/esp-1/buscar': (c) => {
        expect(c).toEqual({ consulta: 'cómo desplegar' });
        return { resultados: [{ documentoId: 'd 1', titulo: 'Guía', fragmento: 0, texto: '<img src=x onerror=alert(1)> despliegue', similitud: 0.834 }] };
      },
    });
    const salida = new Elemento('div');
    await buscarEnEspacio({ espacioId: 'esp-1', consulta: '  cómo desplegar  ', salida: /** @type {any} */ (salida) });
    expect(salida.querySelectorAll('img')).toHaveLength(0);
    const a = /** @type {Elemento} */ (salida.querySelector('a'));
    expect(a.getAttribute('href')).toBe('#/documentos/d%201');
    expect(salida.textContent).toContain('parecido: 83 %');
    expect(/** @type {Elemento} */ (salida.querySelector('.fragmento-ia')).textContent).toBe('<img src=x onerror=alert(1)> despliegue');
  });

  it('sin resultados lo dice; un error se muestra como error', async () => {
    simular({ '/espacios/e/buscar': () => ({ resultados: [] }) });
    const salida = new Elemento('div');
    await buscarEnEspacio({ espacioId: 'e', consulta: 'x', salida: /** @type {any} */ (salida) });
    expect(salida.textContent).toBe('No se encontró nada parecido en este espacio.');
    simular({
      '/espacios/e/buscar': () => {
        throw new ErrorApi({ estado: 503, codigo: 'ia_no_disponible', mensaje: 'x' });
      },
    });
    await buscarEnEspacio({ espacioId: 'e', consulta: 'x', salida: /** @type {any} */ (salida) });
    expect(alertas(salida)).toHaveLength(1);
  });

  it('una consulta vacía no pide nada', async () => {
    simular({});
    const salida = new Elemento('div');
    await buscarEnEspacio({ espacioId: 'e', consulta: '   ', salida: /** @type {any} */ (salida) });
    expect(solicitar).not.toHaveBeenCalled();
  });
});
