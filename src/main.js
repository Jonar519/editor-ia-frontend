// Punto de entrada: estilos (tokens primero), router y sesión. La sesión real llega en el bloque H2
// (access token solo en memoria + refresco con la cookie); por ahora no hay sesión.
import './estilos/tokens.css';
import './estilos/base.css';
import { iniciarRouter } from './router.js';
import { RUTAS } from './rutas.js';

const raiz = document.getElementById('contenido');
if (!raiz) throw new Error('falta <main id="contenido">');

void iniciarRouter({ rutas: RUTAS, raiz, sesion: () => null });
