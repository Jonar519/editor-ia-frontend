// Resultado de eliminar la cuenta, para mostrarlo en #/cuenta-eliminada (vista pública). Vive solo en
// memoria: al recargar ya no está y la vista lo dice sin inventar cifras.

/** @type {{ espaciosBorrados: number, documentosBorrados: number } | null} */
let resultado = null;

/** @param {{ espaciosBorrados: number, documentosBorrados: number }} r */
export function dejarDespedida(r) {
  resultado = r;
}

export const verDespedida = () => resultado;
