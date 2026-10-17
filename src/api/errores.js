// Error del API con la forma del backend: { error: { codigo, mensaje, solicitud, detalles? } }.
// Los fallos que no llegan al servidor también tienen código estable: "red" y "tiempo_agotado".

export class ErrorApi extends Error {
  /**
   * @param {{ estado: number, codigo: string, mensaje: string, solicitud?: string, detalles?: unknown, reintentarEnSegundos?: number }} d
   */
  constructor(d) {
    super(d.mensaje);
    this.name = 'ErrorApi';
    this.estado = d.estado;
    this.codigo = d.codigo;
    this.solicitud = d.solicitud;
    this.detalles = d.detalles;
    this.reintentarEnSegundos = d.reintentarEnSegundos;
  }
}

/**
 * Texto para la persona. Los mensajes del backend ya vienen en español y sin detalles internos; los de
 * red y servidor caído se escriben aquí.
 * @param {unknown} error
 */
export function mensajeParaPersona(error) {
  if (!(error instanceof ErrorApi)) return 'Ocurrió un error inesperado.';
  if (error.codigo === 'red') return 'No hay conexión con el servidor. Revisa tu red.';
  if (error.codigo === 'tiempo_agotado') return 'El servidor tardó demasiado en responder.';
  if (error.estado === 429 && error.reintentarEnSegundos) return `${error.message} Puedes volver a intentar en ${String(error.reintentarEnSegundos)} s.`;
  if (error.estado >= 500) return 'El servidor tuvo un problema. Inténtalo de nuevo en un momento.';
  return error.message;
}
