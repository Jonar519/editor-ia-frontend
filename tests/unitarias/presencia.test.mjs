// Presencia (bloque L): lo que dibuja el editor sale de la cuenta que puso el servidor, nunca del `user`
// que manda otro cliente (y-codemirror.next lo escribe tal cual en un atributo style).
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { COLORES_PRESENCIA, indiceColor, normalizarPresencia, personasPresentes } from '../../src/tiempo-real/presencia.js';

const ANA = { id: '00000000-0000-4000-8000-0000000000a1', nombre: 'Ana Ficticia' };

/** Un estado remoto que llega por la red, como si lo hubiera retransmitido el servidor. */
function llega(/** @type {Awareness} */ local, /** @type {Record<string, unknown>} */ estado) {
  const otro = new Awareness(new Y.Doc());
  otro.setLocalState(estado);
  applyAwarenessUpdate(local, encodeAwarenessUpdate(otro, [otro.clientID]), 'servidor');
  return otro.clientID;
}

describe('presencia', () => {
  it('el color es el mismo para la misma cuenta y está en la paleta', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    const indices = ids.map((id) => indiceColor(id));
    expect(indices).toEqual(ids.map((id) => indiceColor(id)));
    expect(indices.every((i) => i >= 1 && i <= COLORES_PRESENCIA)).toBe(true);
    expect(new Set(indices).size).toBe(COLORES_PRESENCIA); // usa toda la paleta
  });

  it('un color o nombre inventado por otro cliente se reemplaza por el de la cuenta del servidor', () => {
    const local = new Awareness(new Y.Doc());
    normalizarPresencia(local);
    const id = llega(local, {
      usuario: ANA,
      user: { name: 'Otra persona', color: 'red; background-image: url(https://example.com/x)', colorLight: 'url(x)' },
    });
    const i = String(indiceColor(ANA.id));
    expect(local.getStates().get(id)?.user).toEqual({ name: ANA.nombre, color: `var(--color-presencia-${i})`, colorLight: `var(--color-presencia-${i}-seleccion)` });
  });

  it('un estado sin la cuenta del servidor no se dibuja ni cuenta como presente', () => {
    const local = new Awareness(new Y.Doc());
    normalizarPresencia(local);
    const id = llega(local, { user: { name: 'Sin cuenta', color: 'red' } });
    expect(local.getStates().has(id)).toBe(false);
    expect(personasPresentes(local, ANA).map((p) => p.nombre)).toEqual([ANA.nombre]);
  });
});
