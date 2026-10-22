// Anclas de los comentarios (bloque N): el tramo comentado se guarda como dos POSICIONES RELATIVAS de Yjs
// (inicio y fin), no como números. Así siguen al texto cuando se escribe antes o después; si el tramo se
// borra entero, las dos posiciones se juntan y el comentario queda "sobre texto eliminado".
//
// Formato (el mismo que valida el backend): dos varUint8Array de lib0 con Y.encodeRelativePosition, en
// base64url.
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';

/** @param {Uint8Array} bytes */
const aBase64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** @param {string} texto */
function deBase64url(texto) {
  const b = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/**
 * El ancla de un tramo [inicio, fin) del texto. El inicio se pega al carácter de la DERECHA y el fin al de
 * la IZQUIERDA: lo que se escriba justo antes o justo después del tramo no entra en él.
 * @param {Y.Text} texto @param {number} inicio @param {number} fin
 */
export function codificarAncla(texto, inicio, fin) {
  const e = encoding.createEncoder();
  encoding.writeVarUint8Array(e, Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(texto, inicio, 0)));
  encoding.writeVarUint8Array(e, Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(texto, fin, -1)));
  return aBase64url(encoding.toUint8Array(e));
}

/**
 * Dónde está hoy el tramo de un ancla: { inicio, fin } (fin > inicio), o null si el texto se eliminó o el
 * ancla no se puede leer.
 * @param {string} ancla @param {Y.Doc} doc
 * @returns {{ inicio: number, fin: number } | null}
 */
export function resolverAncla(ancla, doc) {
  try {
    const dec = decoding.createDecoder(deBase64url(ancla));
    const a = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(decoding.readVarUint8Array(dec)), doc);
    const b = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(decoding.readVarUint8Array(dec)), doc);
    if (!a || !b || b.index <= a.index) return null;
    return { inicio: a.index, fin: b.index };
  } catch {
    return null;
  }
}
