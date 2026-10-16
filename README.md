# editor-ia-frontend

Interfaz web de **Cuaderno**, un editor colaborativo de documentación técnica con IA.

JavaScript sin framework + Vite, router propio por hash, Web Workers, Service Worker y CSS puro con tokens.

Es el repo del tramo 2. El backend y la base están en [editor-ia-backend](https://github.com/Jonar519/editor-ia-backend) y [editor-ia-database](https://github.com/Jonar519/editor-ia-database).

## Requisitos

- Node 24 y npm.
- Docker Desktop: las pruebas de punta a punta corren en el contenedor oficial de Playwright para Linux.

## Puesta en marcha (cmd.exe)

```bat
cd /d "...\editor-ia\editor-ia-frontend"
npm ci
scripts\dev.bat
```

Abre `http://127.0.0.1:5175`. Las llamadas a `/api` van por proxy al backend en `127.0.0.1:4200`: mismo origen, así que la cookie de refresco (SameSite=Strict) viaja sin CORS.

## Scripts

Todos los `.bat` están en `scripts\` y se pueden ejecutar desde cualquier carpeta.

| Script | Qué hace |
|---|---|
| `dev.bat` | Servidor de desarrollo en `127.0.0.1:5175`. |
| `test.bat` | Pruebas unitarias (Vitest). |
| `e2e.bat` | Pruebas de punta a punta (Playwright + axe, Chromium y Firefox) en el contenedor oficial de Linux. Reporte en `playwright-report\index.html`. |
| `revisar.bat` | Auditoría de significado de color, contraste AA y presupuestos. |
| `mutar.bat [id...]` | Pruebas de mutación del catálogo `mutations\catalogo.json`. |
| `gitleaks.bat` | Busca secretos en todo el historial. |
| `ci.bat` | Los mismos pasos que el CI, con el código de salida de cada uno. |

## Diseño

### Router

- Rutas por hash (`#/documentos`). La tabla está en `src/rutas.js`.
- Cada vista vive en `src/vistas/<grupo>/` y se carga bajo demanda, en su propio archivo. Una persona lectora nunca descarga el código del editor ni el de administración.
- Guardia por rol: sin sesión, lo protegido manda a `#/entrar`; con un rol que no alcanza, muestra "Sin permiso".
- Estados explícitos: cargando, error con "Reintentar", no encontrada y sin permiso.
- Al navegar, el foco va al título de la vista y cambia el título del documento.

### Colores

Dos niveles en `src/estilos/tokens.css`, que es el único archivo con colores literales:

- `--paleta-*`: primitivos, un tono concreto.
- `--color-*`: significados. Son lo único que usan los componentes.

### Tema

Lo decide el sistema operativo (`prefers-color-scheme`): claro por defecto, oscuro si el sistema lo pide. No hay selector manual.

### Auditoría de significado de color (`npm run colores`)

`src/estilos/significados.json` dice qué significa cada `--color-*` y en qué propiedades CSS se puede usar. El script exige:

| Regla | Qué exige |
|---|---|
| R1 | Cada color semántico tiene su significado registrado, y viceversa. |
| R2 | Cada color está definido en los dos temas. |
| R3 | Colores literales solo en los primitivos (también en cadenas del JavaScript). |
| R4 | Ningún componente usa un primitivo. |
| R5 | Cada significado se usa solo donde corresponde. Por ejemplo, `--color-peligro` no puede ser el fondo de un botón. |
| R6 | Los colores de estado (acento, info, éxito, aviso, peligro) no comparten tono en ningún tema. |
| R7 | Una sola animación: un único `@keyframes`, solo sin reducción de movimiento, y ninguna transición. |

### Contraste AA (`npm run contraste`)

Mide cada par de `significados.json` en los dos temas, sin redondear: 4.49 no cumple 4.5.

- Texto: 4.5:1.
- Componentes de interfaz, bordes de controles, íconos y foco: 3:1.

### Presupuestos (`npm run presupuestos`)

Mide, en KiB con gzip sobre el build real (`dist/.vite/manifest.json`):

- el JS de primera carga;
- el JS de cada rol;
- el chunk más grande;
- el CSS total.

Los topes viven en `presupuestos.json`:

- Mientras un tope esté en `null` (pendiente de confirmación escrita), se mide y se informa, pero no falla.
- Con un número, el build falla si se pasa.
- Nunca se sube un tope para que el build pase.

### Accesibilidad

- axe (WCAG 2.1 A/AA) en las pruebas de punta a punta, en los dos temas.
- El color nunca es el único medio: cada aviso nombra su estado ("Error:", "Listo:").
- Foco siempre visible.
- Enlace para saltar al contenido.
- Sin animación si el sistema pide reducir el movimiento.

### Seguridad

- Sin `innerHTML`: los nodos se crean con `h()` (`src/dom.js`), el texto entra como texto y los atributos `on*` se rechazan.
- `<meta name="referrer" content="no-referrer">`.
