// Región viva (aria-live="polite") para anunciar cambios que no mueven el foco: "Cargado", "No se pudo
// cargar"... Está en index.html (#anuncios) para que exista ANTES del primer anuncio: los lectores de
// pantalla ignoran regiones vivas creadas en el mismo momento que su contenido.

/** @param {string} texto */
export function anunciar(texto) {
  const region = document.getElementById('anuncios');
  if (!region) return;
  // Vaciar y volver a escribir: así se anuncia aunque el texto sea el mismo que el anterior.
  region.textContent = '';
  setTimeout(() => {
    region.textContent = texto;
  }, 50);
}
