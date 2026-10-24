// Lector de SSE (text/event-stream) para resumir y mejorar (bloque Q; ADR 0002 del backend): el API manda
//   event: fragmento  data: {"texto":"…"}
//   event: fin        data: {"tokensEntrada":…, "tokensSalida":…}
//   event: error      data: {"codigo":"…", "mensaje":"…"}
// y comentarios de latido (": latido") que se ignoran. Incremental: un trozo de red puede cortar un
// evento por la mitad; se arma cuando llega la línea en blanco que lo cierra.

/** @typedef {{ evento: string, datos: unknown }} EventoSse */

/** Un lector incremental: `empujar(trozo)` devuelve los eventos completos que ya se pueden usar. */
export function crearLectorSse() {
  let resto = '';
  return {
    /** @param {string} trozo @returns {EventoSse[]} */
    empujar(trozo) {
      resto += trozo.replace(/\r\n?/g, '\n');
      /** @type {EventoSse[]} */
      const eventos = [];
      let corte = resto.indexOf('\n\n');
      while (corte >= 0) {
        const e = bloque(resto.slice(0, corte));
        if (e) eventos.push(e);
        resto = resto.slice(corte + 2);
        corte = resto.indexOf('\n\n');
      }
      return eventos;
    },
    /** Lo que quedó sin línea en blanco final (una corriente cortada). */
    pendiente: () => resto.trim() !== '',
  };
}

/** @param {string} texto @returns {EventoSse | null} */
function bloque(texto) {
  let evento = 'message';
  /** @type {string[]} */
  const datos = [];
  for (const linea of texto.split('\n')) {
    if (linea === '' || linea.startsWith(':')) continue; // comentario (latido)
    const dos = linea.indexOf(':');
    const campo = dos < 0 ? linea : linea.slice(0, dos);
    const valor = dos < 0 ? '' : linea.slice(dos + 1).replace(/^ /, '');
    if (campo === 'event') evento = valor;
    else if (campo === 'data') datos.push(valor);
  }
  if (datos.length === 0) return null;
  return { evento, datos: JSON.parse(datos.join('\n')) };
}

/**
 * Lee la corriente entera y llama a `alEvento` por cada evento, en orden.
 * @param {ReadableStream<Uint8Array>} cuerpo
 * @param {(e: EventoSse) => void} alEvento
 * @returns {Promise<{ completa: boolean }>} completa: el último evento quedó cerrado (no se cortó a mitad)
 */
export async function leerSse(cuerpo, alEvento) {
  const lector = crearLectorSse();
  const fuente = cuerpo.getReader();
  // stream: true: una letra con tilde cortada entre dos trozos de red se arma bien.
  const decodificar = new TextDecoder();
  for (;;) {
    const { value, done } = await fuente.read();
    for (const e of lector.empujar(done ? decodificar.decode() : decodificar.decode(value, { stream: true }))) alEvento(e);
    if (done) break;
  }
  return { completa: !lector.pendiente() };
}
