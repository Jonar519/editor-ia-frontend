// Punto de entrada: fuentes y estilos (tokens primero), sesión, router y Service Worker.
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght-italic.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './estilos/tokens.css';
import './estilos/base.css';
import { iniciarRouter } from './router.js';
import { RUTAS } from './rutas.js';
import { api, restaurarSesion, sesionParaRouter } from './sesion.js';
import { registrarServiceWorker } from './sw/registrar.js';

const raiz = document.getElementById('contenido');
if (!raiz) throw new Error('falta <main id="contenido">');

// El access token no sobrevive a una recarga (vive solo en memoria): primero se intenta recuperar la
// sesión con la cookie de refresco, y recién entonces se decide qué vista mostrar.
await restaurarSesion();
const router = iniciarRouter({ rutas: RUTAS, raiz, sesion: sesionParaRouter });
// Si la sesión termina (refresco rechazado, sesión cerrada en otro dispositivo), la vista actual se
// vuelve a evaluar: una sección protegida manda a Entrar.
api.suscribir(() => void router.navegar());
registrarServiceWorker();
