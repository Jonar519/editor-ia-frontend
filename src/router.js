// Router por hash (#/ruta). Lo puro (resolver y decidir) está separado de lo que toca el DOM para
// probarlo sin navegador.
//
// Estados explícitos de cada navegación: cargando → vista, o error con "Reintentar". No encontrado y
// sin permiso son vistas propias. Al cambiar de vista el foco va al título (h1) y el título del
// documento cambia: quien usa lector de pantalla oye adónde llegó.
import { aviso, h } from './dom.js';
import { GRUPOS_POR_ROL } from './rutas.js';

/**
 * @typedef {import('./rutas.js').Ruta} Ruta
 * @typedef {import('./rutas.js').Rol} Rol
 * @typedef {{ rol: Rol } | null} Sesion
 * @typedef {{ tipo: 'vista', ruta: Ruta, params: Record<string, string> }
 *   | { tipo: 'no_encontrada' }
 *   | { tipo: 'entrar' }
 *   | { tipo: 'sin_permiso', ruta: Ruta }} Decision
 */

/**
 * Ruta del hash: "#/documentos/7/editar" → "/documentos/7/editar". Un hash que no empieza con "#/" (por
 * ejemplo "#contenido", el enlace para saltar al contenido) no es una ruta: devuelve null.
 * @param {string} hash
 * @returns {string | null}
 */
export function rutaDelHash(hash) {
  if (hash === '' || hash === '#') return '/';
  if (!hash.startsWith('#/')) return null;
  const sinConsulta = hash.slice(1).split('?')[0] ?? '/';
  return sinConsulta.length > 1 ? sinConsulta.replace(/\/+$/, '') : '/';
}

/**
 * Busca la ruta cuyo patrón coincide. Los ":param" capturan UN segmento (sin "/").
 * @param {string} camino
 * @param {Ruta[]} rutas
 * @returns {{ ruta: Ruta, params: Record<string, string> } | null}
 */
export function resolver(camino, rutas) {
  const partes = camino.split('/').filter(Boolean);
  for (const ruta of rutas) {
    const patron = ruta.patron.split('/').filter(Boolean);
    if (patron.length !== partes.length) continue;
    /** @type {Record<string, string>} */
    const params = {};
    const coincide = patron.every((p, i) => {
      const valor = partes[i] ?? '';
      if (p.startsWith(':')) {
        try {
          params[p.slice(1)] = decodeURIComponent(valor);
        } catch {
          return false; // %-escape inválido
        }
        return true;
      }
      return p === valor;
    });
    if (coincide) return { ruta, params };
  }
  return null;
}

/**
 * Qué mostrar: la vista, "no encontrada", ir a entrar (sin sesión) o "sin permiso" (el rol no alcanza).
 * @param {string} camino
 * @param {Ruta[]} rutas
 * @param {Sesion} sesion
 * @returns {Decision}
 */
export function decidir(camino, rutas, sesion) {
  const r = resolver(camino, rutas);
  if (!r) return { tipo: 'no_encontrada' };
  if (r.ruta.grupo === 'publico') return { tipo: 'vista', ...r };
  if (!sesion) return { tipo: 'entrar' };
  const grupos = /** @type {readonly string[]} */ (GRUPOS_POR_ROL[sesion.rol]);
  return grupos.includes(r.ruta.grupo) ? { tipo: 'vista', ...r } : { tipo: 'sin_permiso', ruta: r.ruta };
}

// ─── DOM ──────────────────────────────────────────────────────────────────────────

/** Vistas que no se cargan aparte: tienen que funcionar aunque falle la red. */
const vistaNoEncontrada = () =>
  h('section', {}, h('h1', { tabindex: '-1' }, 'Página no encontrada'), h('p', {}, 'Esta dirección no existe. '), h('a', { href: '#/' }, 'Volver al inicio'));

const vistaSinPermiso = () =>
  h(
    'section',
    {},
    h('h1', { tabindex: '-1' }, 'Sin permiso'),
    aviso('advertencia', 'Tu cuenta no tiene acceso a esta sección.'),
    h('a', { href: '#/' }, 'Volver al inicio'),
  );

/**
 * Arranca el router. Devuelve `navegar` para volver a evaluar la ruta actual (por ejemplo, cuando la
 * sesión cambia) y `listo`, la primera navegación.
 * @param {{ rutas: Ruta[], raiz: HTMLElement, sesion: () => Sesion, ventana?: Window }} o
 * @returns {{ navegar: () => Promise<void>, listo: Promise<void> }}
 */
export function iniciarRouter(o) {
  const w = o.ventana ?? window;
  let turno = 0;

  /** Coloca el contenido y lleva el foco a su título. */
  function mostrar(/** @type {HTMLElement} */ contenido, /** @type {string} */ titulo) {
    const vista = h('div', { class: 'vista' }, contenido);
    o.raiz.replaceChildren(vista);
    o.raiz.removeAttribute('aria-busy');
    w.document.title = `${titulo} · Cuaderno`;
    vista.querySelector('h1')?.focus();
  }

  function marcarNavegacion(/** @type {string} */ camino) {
    for (const a of w.document.querySelectorAll('[data-ruta]')) {
      if (a.getAttribute('data-ruta') === camino) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }

  async function navegar() {
    const camino = rutaDelHash(w.location.hash);
    if (camino === null) return; // ancla dentro de la página, no una ruta
    const mio = ++turno;
    marcarNavegacion(camino);
    const d = decidir(camino, o.rutas, o.sesion());
    if (d.tipo === 'entrar') {
      w.location.replace('#/entrar');
      return;
    }
    if (d.tipo === 'no_encontrada') return mostrar(vistaNoEncontrada(), 'Página no encontrada');
    if (d.tipo === 'sin_permiso') return mostrar(vistaSinPermiso(), 'Sin permiso');

    o.raiz.setAttribute('aria-busy', 'true');
    o.raiz.replaceChildren(h('p', { class: 'cargando', role: 'status' }, 'Cargando…'));
    try {
      const modulo = await d.ruta.cargar();
      const contenido = await modulo.render(d.params);
      if (mio === turno) mostrar(contenido, d.ruta.titulo);
    } catch (err) {
      if (mio !== turno) return;
      console.error('No se pudo cargar la vista', err);
      const reintentar = h('button', { class: 'boton', type: 'button' }, 'Reintentar');
      // Recargar, no volver a llamar a import(): Chromium guarda en el mapa de módulos del documento un
      // import() que falló y lo devuelve fallido para siempre. Recargar empieza con un mapa limpio.
      reintentar.addEventListener('click', () => w.location.reload());
      mostrar(
        h('section', {}, h('h1', { tabindex: '-1' }, 'No se pudo cargar'), aviso('error', 'Revisa tu conexión e inténtalo de nuevo.'), reintentar),
        'Error',
      );
    }
  }

  // El enlace para saltar al contenido mueve el foco sin cambiar de ruta.
  w.document.querySelector('[data-saltar]')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    o.raiz.focus();
  });
  w.addEventListener('hashchange', () => void navegar());
  return { navegar, listo: navegar() };
}
