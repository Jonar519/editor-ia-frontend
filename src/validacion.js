// Validación previa en el cliente. NO reemplaza al servidor (que aplica la política completa: comunes,
// repetitivas, que contengan el correo o el nombre); solo evita un viaje por errores evidentes.

/** Lo mismo que exige el backend (src/auth/contrasenas.ts). */
export const LARGO_MINIMO = 12;
export const LARGO_MAXIMO = 128;

/**
 * @param {string} nueva
 * @param {string} confirmacion
 * @returns {{ campo: 'nueva' | 'confirmacion', mensaje: string } | null}
 */
export function problemaContrasenaNueva(nueva, confirmacion) {
  const largo = [...nueva].length;
  if (largo < LARGO_MINIMO) return { campo: 'nueva', mensaje: `Usa al menos ${String(LARGO_MINIMO)} caracteres. Una frase de varias palabras es fácil de recordar.` };
  if (largo > LARGO_MAXIMO) return { campo: 'nueva', mensaje: `Usa como máximo ${String(LARGO_MAXIMO)} caracteres.` };
  if (nueva !== confirmacion) return { campo: 'confirmacion', mensaje: 'Las dos contraseñas no coinciden.' };
  return null;
}

/** Código TOTP: 6 dígitos (se aceptan espacios al pegarlo: "123 456"). */
export function normalizarCodigo(/** @type {string} */ texto) {
  const c = texto.replace(/\s+/g, '');
  return /^\d{6}$/.test(c) ? c : null;
}

/** Código de respaldo: XXXXX-XXXXX en mayúsculas (se acepta sin guion o con espacios). */
export function normalizarCodigoRespaldo(/** @type {string} */ texto) {
  const c = texto.replace(/[\s-]+/g, '').toUpperCase();
  return /^[A-Z0-9]{10}$/.test(c) ? `${c.slice(0, 5)}-${c.slice(5)}` : null;
}
