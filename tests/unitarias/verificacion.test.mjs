// Verificar la cadena de hash desde el historial (bloque R): lo que se le dice a la persona. Quien
// recalcula la cadena es la base (prueba de integración del backend); aquí, que «alterada» nunca se
// muestre como éxito y que diga desde qué versión.
import { describe, expect, it } from 'vitest';
import { textoVerificacion } from '../../src/vistas/lector/versiones.js';

describe('resultado de verificar la cadena', () => {
  it('alterada: error, con el número de la primera versión que no encadena', () => {
    expect(textoVerificacion({ integra: false, versiones: 5, alteradaDesde: 3 })).toEqual({ tipo: 'error', texto: 'La cadena está alterada desde la versión 3.' });
  });

  it('íntegra: éxito, con cuántas versiones se verificaron', () => {
    expect(textoVerificacion({ integra: true, versiones: 4, alteradaDesde: null })).toEqual({ tipo: 'exito', texto: 'La cadena está íntegra: 4 versiones verificadas.' });
    expect(textoVerificacion({ integra: true, versiones: 1, alteradaDesde: null }).texto).toBe('La cadena está íntegra: 1 versión verificada.');
  });

  it('sin versiones: íntegra, y lo dice', () => {
    expect(textoVerificacion({ integra: true, versiones: 0, alteradaDesde: null })).toEqual({ tipo: 'exito', texto: 'La cadena está íntegra: todavía no hay versiones.' });
  });
});
