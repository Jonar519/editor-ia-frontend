// h() sin navegador: un `document` mínimo que registra lo que se le pide.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { h } from '../../src/dom.js';

/** @typedef {{ etiqueta: string, atributos: Record<string, string>, hijos: unknown[] }} NodoFalso */

beforeAll(() => {
  /** @type {any} */ (globalThis).document = {
    /** @param {string} etiqueta */
    createElement: (etiqueta) => {
      /** @type {NodoFalso & { setAttribute: (n: string, v: string) => void, append: (x: unknown) => void }} */
      const nodo = {
        etiqueta,
        atributos: {},
        hijos: [],
        setAttribute: (n, v) => {
          nodo.atributos[n] = v;
        },
        append: (x) => {
          nodo.hijos.push(x);
        },
      };
      return nodo;
    },
    /** @param {string} texto */
    createTextNode: (texto) => ({ texto }),
  };
});
afterAll(() => {
  delete (/** @type {any} */ (globalThis).document);
});

describe('h()', () => {
  it('el texto entra como nodo de texto (nunca como HTML) y los atributos como atributos', () => {
    const el = /** @type {NodoFalso} */ (/** @type {unknown} */ (h('p', { class: 'suave', hidden: true, title: undefined }, '<img src=x onerror=alert(1)>')));
    expect(el.atributos).toEqual({ class: 'suave', hidden: '' });
    expect(el.hijos).toEqual([{ texto: '<img src=x onerror=alert(1)>' }]);
  });

  it('rechaza atributos de evento (on*): los eventos van con addEventListener', () => {
    expect(() => h('a', { onclick: 'alert(1)' })).toThrow(/evento/);
    expect(() => h('img', { OnError: 'alert(1)' })).toThrow(/evento/);
  });
});
