// Tabla de rutas. Cada vista vive en src/vistas/<grupo>/ y se carga bajo demanda (import dinámico): Vite
// la saca en su propio archivo, así una persona lectora nunca descarga el código del editor ni el de
// administración. scripts/presupuestos.mjs mide el JS de cada rol con estos mismos grupos.

/**
 * @typedef {'publico' | 'lector' | 'editor' | 'admin'} Grupo
 * @typedef {'admin' | 'editor' | 'lector'} Rol
 * @typedef {{ render: (params: Record<string, string>) => HTMLElement | Promise<HTMLElement> }} ModuloVista
 * @typedef {{ patron: string, grupo: Grupo, titulo: string, cargar: () => Promise<ModuloVista> }} Ruta
 */

/** Grupos de vistas que puede abrir cada rol (los mismos que presupuestos.json). */
export const GRUPOS_POR_ROL = /** @type {const} */ ({
  lector: ['publico', 'lector'],
  editor: ['publico', 'lector', 'editor'],
  admin: ['publico', 'lector', 'editor', 'admin'],
});

/** @type {Ruta[]} */
export const RUTAS = [
  { patron: '/', grupo: 'publico', titulo: 'Inicio', cargar: () => import('./vistas/publico/inicio.js') },
  { patron: '/entrar', grupo: 'publico', titulo: 'Entrar', cargar: () => import('./vistas/publico/entrar.js') },
  { patron: '/documentos', grupo: 'lector', titulo: 'Documentos', cargar: () => import('./vistas/lector/documentos.js') },
  { patron: '/documentos/:id/editar', grupo: 'editor', titulo: 'Editar documento', cargar: () => import('./vistas/editor/editar.js') },
  { patron: '/admin', grupo: 'admin', titulo: 'Administración', cargar: () => import('./vistas/admin/panel.js') },
];
