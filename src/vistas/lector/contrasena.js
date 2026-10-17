// Tu cuenta → Contraseña: pide la actual, aplica la misma validación previa que la recuperación y dice
// cuántas sesiones de OTROS dispositivos se cerraron (el backend las cierra; esta sigue abierta).
import { ErrorApi } from '../../api/errores.js';
import { campoContrasena, controlEnvio, detallesComoLista } from '../../componentes/formulario.js';
import { h } from '../../dom.js';
import { api } from '../../sesion.js';
import { problemaContrasenaNueva } from '../../validacion.js';
import { paginaCuenta, resultado } from './comun.js';

/** Texto del resultado según cuántas sesiones se cerraron. */
export function textoCerradas(/** @type {number} */ n) {
  if (n === 0) return 'Cambiamos tu contraseña. No había sesiones abiertas en otros dispositivos.';
  return `Cambiamos tu contraseña y cerramos ${String(n)} ${n === 1 ? 'sesión' : 'sesiones'} en otros dispositivos.`;
}

export function render() {
  const actual = campoContrasena({ etiqueta: 'Contraseña actual', nombre: 'actual', autocompletar: 'current-password' });
  const nueva = campoContrasena({ etiqueta: 'Contraseña nueva', nombre: 'nueva', autocompletar: 'new-password', ayuda: 'Al menos 12 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.' });
  const repetir = campoContrasena({ etiqueta: 'Repite la contraseña nueva', nombre: 'repetir', autocompletar: 'new-password' });
  const boton = h('button', { class: 'boton boton-primario', type: 'submit' }, 'Cambiar la contraseña');
  const salida = h('div', {});
  const form = h('form', { class: 'tarjeta', novalidate: true, 'aria-label': 'Cambiar la contraseña' }, actual.contenedor, nueva.contenedor, repetir.contenedor, boton, salida);
  const envio = controlEnvio(form, boton);
  const campos = [actual, nueva, repetir];

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    for (const c of campos) c.error(null);
    salida.replaceChildren();
    if (actual.valor() === '') {
      actual.error('Escribe tu contraseña actual.');
      actual.input.focus();
      return;
    }
    const p = problemaContrasenaNueva(nueva.valor(), repetir.valor());
    if (p) {
      const c = p.campo === 'nueva' ? nueva : repetir;
      c.error(p.mensaje);
      c.input.focus();
      return;
    }
    envio.enviando('Cambiando…');
    void (async () => {
      try {
        /** @type {{ cerradas: number }} */
        const r = await api.solicitar('/cuenta/contrasena', { metodo: 'POST', cuerpo: { actual: actual.valor(), nueva: nueva.valor() } });
        for (const c of campos) {
          c.ocultar();
          c.input.value = '';
        }
        envio.listo();
        resultado(salida, 'exito', textoCerradas(r.cerradas));
      } catch (err) {
        envio.listo();
        for (const c of campos) c.ocultar();
        if (err instanceof ErrorApi && err.codigo === 'contrasena_incorrecta') {
          actual.error('La contraseña actual no es correcta.');
          actual.input.focus();
          return;
        }
        envio.error(err, detallesComoLista(err));
      }
    })();
  });

  return paginaCuenta(
    '/cuenta/contrasena',
    'Cambiar la contraseña',
    h('p', {}, 'Al cambiarla se cierran tus sesiones en otros dispositivos y dejan de servir los enlaces de recuperación que hayas pedido.'),
    form,
  );
}
