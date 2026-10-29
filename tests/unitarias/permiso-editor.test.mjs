// Cuándo el editor deja escribir (R10): por el rol que manda el servidor y por cómo terminó la conexión.
// Que la vista lo aplique (CodeMirror de solo lectura, el aviso) lo prueba la E2E de editor.spec.mjs.
import { EditorState } from '@codemirror/state';
import { ySyncAnnotation } from 'y-codemirror.next';
import { describe, expect, it, vi } from 'vitest';
import { atajosConPermiso, deshacerSinPermiso, filtroSinPermiso, permisoEditor } from '../../src/vistas/editor/permiso.js';

/** Un permiso y la lista de lo que avisó. */
function conAvisos(/** @type {string} */ rol) {
  /** @type {import('../../src/vistas/editor/permiso.js').EstadoPermiso[]} */
  const avisos = [];
  const p = permisoEditor(rol, (e) => avisos.push(e));
  return { p, avisos };
}

describe('permiso del editor', () => {
  it('por el rol: editor y propietario escriben; lector no', () => {
    expect(permisoEditor('editor', () => {}).puede()).toBe(true);
    expect(permisoEditor('propietario', () => {}).puede()).toBe(true);
    expect(permisoEditor('lector', () => {}).puede()).toBe(false);
  });

  it('el rol baja a lector durante la sesión: deja de escribir y avisa', () => {
    const { p, avisos } = conAvisos('editor');
    p.ponerRol('lector');
    expect(p.puede()).toBe(false);
    expect(avisos).toEqual([{ puede: false, cortado: false }]);
    expect(p.rol()).toBe('lector');
    // Y si vuelve a editor (otro cambio de permiso), vuelve a escribir.
    p.ponerRol('editor');
    expect(avisos.at(-1)).toEqual({ puede: true, cortado: false });
  });

  it('sin acceso: solo lectura para siempre, aunque después llegue un rol de edición', () => {
    const { p, avisos } = conAvisos('editor');
    p.ponerEstadoRed('sin-acceso');
    expect(p.puede()).toBe(false);
    expect(avisos).toEqual([{ puede: false, cortado: true }]);
    p.ponerRol('editor');
    expect(p.puede()).toBe(false);
    expect(avisos.at(-1)).toEqual({ puede: false, cortado: true });
    // El resto de la página (IA, comentarios) actúa como quien lee.
    expect(p.rol()).toBe('lector');
  });

  it('documento borrado: solo lectura para siempre', () => {
    const { p, avisos } = conAvisos('propietario');
    p.ponerEstadoRed('borrado');
    expect(p.puede()).toBe(false);
    expect(avisos).toEqual([{ puede: false, cortado: true }]);
    expect(p.rol()).toBe('lector');
  });

  it('la sesión terminó: sigue editable (bloque M: lo escrito se envía al volver a entrar)', () => {
    const { p, avisos } = conAvisos('editor');
    p.ponerEstadoRed('sesion-terminada');
    expect(p.puede()).toBe(true);
    expect(avisos).toEqual([]);
  });

  it('los demás estados de la red no cambian nada', () => {
    const { p, avisos } = conAvisos('editor');
    for (const e of /** @type {const} */ (['conectando', 'conectado', 'reconectando', 'demasiado-grande', 'error'])) p.ponerEstadoRed(e);
    expect(p.puede()).toBe(true);
    expect(p.rol()).toBe('editor');
    expect(avisos).toEqual([]);
  });

  it('cortar avisa una sola vez', () => {
    const { p, avisos } = conAvisos('editor');
    p.ponerEstadoRed('sin-acceso');
    p.ponerEstadoRed('borrado');
    expect(avisos).toHaveLength(1);
  });
});

describe('el editor sin permiso no cambia el texto por su cuenta', () => {
  const permiso = (/** @type {boolean} */ puede) => ({ puede: () => puede });
  const estado = (/** @type {boolean} */ puede) => EditorState.create({ doc: 'Antes', extensions: [filtroSinPermiso(permiso(puede))] });
  const insertar = { changes: { from: 5, insert: ' local' } };

  it('con permiso, los cambios pasan', () => {
    expect(estado(true).update(insertar).state.doc.toString()).toBe('Antes local');
  });

  it('sin permiso, un cambio de este editor (teclado, comando, IA) se descarta', () => {
    expect(estado(false).update(insertar).state.doc.toString()).toBe('Antes');
  });

  it('sin permiso, lo que llega del documento compartido sí se aplica (lo que escriben los demás)', () => {
    const remoto = { ...insertar, annotations: ySyncAnnotation.of(/** @type {any} */ ({})) };
    expect(estado(false).update(remoto).state.doc.toString()).toBe('Antes local');
  });

  it('los atajos que editan (deshacer incluido) no corren sin permiso, y se consumen', () => {
    const deshacer = vi.fn((/** @type {unknown} */ _vista) => true);
    const [sin] = atajosConPermiso(permiso(false), [{ key: 'Mod-z', run: deshacer, preventDefault: true }]);
    const vista = /** @type {any} */ ({});
    expect(sin?.run?.(vista)).toBe(true);
    expect(deshacer).not.toHaveBeenCalled();
    expect(sin).toMatchObject({ key: 'Mod-z', preventDefault: true });
    const [con] = atajosConPermiso(permiso(true), [{ key: 'Mod-z', run: deshacer }]);
    expect(con?.run?.(vista)).toBe(true);
    expect(deshacer).toHaveBeenCalledOnce();
  });

  it('el deshacer y el rehacer del navegador se cancelan sin permiso (yCollab no llega a verlos)', () => {
    const evento = (/** @type {string} */ inputType) => ({ inputType, preventDefault: vi.fn() });
    for (const tipo of ['historyUndo', 'historyRedo']) {
      const e = evento(tipo);
      expect(deshacerSinPermiso(permiso(false))(/** @type {any} */ (e))).toBe(true);
      expect(e.preventDefault).toHaveBeenCalledOnce();
      const conPermiso = evento(tipo);
      expect(deshacerSinPermiso(permiso(true))(/** @type {any} */ (conPermiso))).toBe(false);
      expect(conPermiso.preventDefault).not.toHaveBeenCalled();
    }
    // Lo demás sigue su camino (el readOnly de CodeMirror y el filtro se encargan).
    const escribir = evento('insertText');
    expect(deshacerSinPermiso(permiso(false))(/** @type {any} */ (escribir))).toBe(false);
    expect(escribir.preventDefault).not.toHaveBeenCalled();
  });
});
