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
  // Las rutas con token llegan desde un enlace de correo; la vista borra el token de la URL al leerlo y
  // deja la ruta base (sin token), que también existe.
  { patron: '/recuperar', grupo: 'publico', titulo: 'Recuperar la contraseña', cargar: () => import('./vistas/publico/recuperar.js') },
  { patron: '/recuperar/:token', grupo: 'publico', titulo: 'Elegir una contraseña nueva', cargar: () => import('./vistas/publico/recuperar.js') },
  { patron: '/invitacion', grupo: 'publico', titulo: 'Crear tu cuenta', cargar: () => import('./vistas/publico/invitacion.js') },
  { patron: '/invitacion/:token', grupo: 'publico', titulo: 'Crear tu cuenta', cargar: () => import('./vistas/publico/invitacion.js') },
  { patron: '/correo', grupo: 'publico', titulo: 'Confirmar tu nuevo correo', cargar: () => import('./vistas/publico/correo.js') },
  { patron: '/correo/:token', grupo: 'publico', titulo: 'Confirmar tu nuevo correo', cargar: () => import('./vistas/publico/correo.js') },
  { patron: '/cuenta-eliminada', grupo: 'publico', titulo: 'Cuenta eliminada', cargar: () => import('./vistas/publico/cuenta-eliminada.js') },
  { patron: '/documentos', grupo: 'lector', titulo: 'Documentos', cargar: () => import('./vistas/lector/documentos.js') },
  // Leer un documento: sin CodeMirror (solo Yjs). Editarlo es del grupo editor (más abajo).
  { patron: '/documentos/:id', grupo: 'lector', titulo: 'Documento', cargar: () => import('./vistas/lector/documento.js') },
  // Historial (bloque N): cualquier rol lo ve; guardar y restaurar, editor o propietario (lo decide el API).
  { patron: '/documentos/:id/versiones', grupo: 'lector', titulo: 'Historial de versiones', cargar: () => import('./vistas/lector/versiones.js') },
  // "Tu cuenta": todos los roles. Cada sección es su propio archivo (se mide por separado).
  { patron: '/cuenta', grupo: 'lector', titulo: 'Tu cuenta', cargar: () => import('./vistas/lector/cuenta.js') },
  { patron: '/cuenta/foto', grupo: 'lector', titulo: 'Foto de perfil', cargar: () => import('./vistas/lector/foto.js') },
  { patron: '/cuenta/correo', grupo: 'lector', titulo: 'Cambiar el correo', cargar: () => import('./vistas/lector/cambiar-correo.js') },
  { patron: '/cuenta/contrasena', grupo: 'lector', titulo: 'Cambiar la contraseña', cargar: () => import('./vistas/lector/contrasena.js') },
  { patron: '/cuenta/dos-pasos', grupo: 'lector', titulo: 'Verificación en dos pasos', cargar: () => import('./vistas/lector/dos-pasos.js') },
  { patron: '/cuenta/sesiones', grupo: 'lector', titulo: 'Sesiones abiertas', cargar: () => import('./vistas/lector/sesiones.js') },
  { patron: '/cuenta/datos', grupo: 'lector', titulo: 'Tus datos', cargar: () => import('./vistas/lector/datos.js') },
  { patron: '/documentos/:id/editar', grupo: 'editor', titulo: 'Editar documento', cargar: () => import('./vistas/editor/editar.js') },
  { patron: '/admin', grupo: 'admin', titulo: 'Administración', cargar: () => import('./vistas/admin/panel.js') },
];
