// Mensajes para la persona de los errores de la IA (bloque Q). Los códigos son los del backend (mapeo
// gRPC → HTTP del ADR 0002 y el tope diario). Se muestran como error (--color-peligro), nunca en violeta.
import { ErrorApi, mensajeParaPersona } from '../api/errores.js';

/** "HH:MM" en la hora local de la persona, `segundos` desde ahora. */
export function horaLocal(/** @type {number} */ segundos, ahora = Date.now()) {
  const d = new Date(ahora + segundos * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * @param {unknown} error un ErrorApi, o el { codigo, mensaje } de un `event: error` del SSE
 * @param {number} [ahora]
 */
export function mensajeIa(error, ahora = Date.now()) {
  const codigo = error instanceof ErrorApi ? error.codigo : /** @type {{ codigo?: unknown }} */ (error ?? {}).codigo;
  const espera = error instanceof ErrorApi ? error.reintentarEnSegundos : undefined;
  switch (codigo) {
    case 'ia_no_disponible':
      return 'La IA no está disponible en este momento. Inténtalo más tarde.';
    case 'ia_tiempo_agotado':
      return 'La IA tardó demasiado en responder. Inténtalo de nuevo.';
    case 'ia_saturada':
      return espera ? `La IA está saturada. Vuelve a intentar en ${String(espera)} s.` : 'La IA está saturada. Vuelve a intentar en un momento.';
    case 'tope_diario_ia':
      return espera ? `Llegaste al uso diario de la IA. Se renueva a las ${horaLocal(espera, ahora)}.` : 'Llegaste al uso diario de la IA. Se renueva a medianoche (UTC).';
    case 'ia_error_interno':
    case 'interno':
      return 'La IA tuvo un problema. Inténtalo de nuevo.';
    case 'ia_solicitud_invalida':
      return 'La IA no pudo procesar ese texto.';
    case 'sin_permiso':
      return 'Tu permiso no alcanza para esta acción de IA.';
    default:
      return error instanceof ErrorApi ? mensajeParaPersona(error) : 'La IA tuvo un problema. Inténtalo de nuevo.';
  }
}
