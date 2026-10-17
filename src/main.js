// Punto de entrada: fuentes y estilos (tokens primero), sesión, router y Service Worker.
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './estilos/tokens.css';
import './estilos/base.css';
import { anunciar } from './componentes/anunciar.js';
import { iniciarRouter } from './router.js';
import { RUTAS } from './rutas.js';
import { api, cerrarSesion, recordarDestino, restaurarSesion, sesionParaRouter } from './sesion.js';
import { registrarServiceWorker } from './sw/registrar.js';

const raiz = document.getElementById('contenido');
if (!raiz) throw new Error('falta <main id="contenido">');

/** La navegación muestra "Tu cuenta" y "Salir" con sesión, y "Entrar" sin ella. */
function actualizarNavegacion() {
  const con = Boolean(api.usuario());
  for (const el of document.querySelectorAll('[data-con-sesion]')) /** @type {HTMLElement} */ (el).hidden = !con;
  for (const el of document.querySelectorAll('[data-sin-sesion]')) /** @type {HTMLElement} */ (el).hidden = con;
}

document.querySelector('[data-salir]')?.addEventListener('click', () => {
  void cerrarSesion().then(() => {
    anunciar('Cerraste la sesión.');
    window.location.hash = '#/';
  });
});

// El access token no sobrevive a una recarga (vive solo en memoria): primero se intenta recuperar la
// sesión con la cookie de refresco, y recién entonces se decide qué vista mostrar.
await restaurarSesion();
actualizarNavegacion();
const router = iniciarRouter({ rutas: RUTAS, raiz, sesion: sesionParaRouter, alMandarAEntrar: recordarDestino });
// Si la sesión cambia (entró, salió, terminó en otro dispositivo), la navegación se actualiza y la vista
// se vuelve a evaluar SIN redibujar si sigue siendo la misma (ver debeRedibujar en router.js).
api.suscribir(() => {
  actualizarNavegacion();
  void router.reevaluar();
});
registrarServiceWorker();
