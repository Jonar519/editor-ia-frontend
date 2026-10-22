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

Abre `http://127.0.0.1:5175`. Las llamadas a `/api` van por proxy al backend en `127.0.0.1:4200`: mismo origen, así que la cookie de refresco (SameSite=Strict) viaja sin CORS. El backend no usa CORS.

**Valores del backend que el inicio de sesión necesita en desarrollo** (en su `.env`; ninguno es secreto). Están comprobados en Chrome 152 contra un backend real con la base de **pruebas**:

| Variable | Valor en desarrollo | Por qué |
|---|---|---|
| `APP_URL` | `http://127.0.0.1:5175` | El backend compara el `Origin` del refresco con este origen. Tiene que ser exactamente el del frontend: mismo esquema, `127.0.0.1` (no `localhost`) y el puerto 5175. |
| `COOKIE_SECURE` | `true` | Los navegadores aceptan una cookie `Secure` sobre `http://127.0.0.1`. En producción es obligatoria. |

**Otro backend local (opcional).** `CUADERNO_API=http://127.0.0.1:<puerto>` apunta el proxy a otro backend, por ejemplo uno contra la base de pruebas en el puerto 4201. Solo se acepta `127.0.0.1`.

## Pantallas de entrada

| Ruta | Pantalla |
|---|---|
| `#/` | Hero: qué es Cuaderno y una sola acción, Entrar. Con sesión, lleva a `#/documentos`. |
| `#/entrar` | Correo y contraseña. Si la cuenta usa MFA, segundo paso con código de la app o de respaldo. Después vuelve a la sección protegida que se quiso abrir. |
| `#/recuperar` y `#/recuperar/<token>` | Pedir el enlace (misma respuesta exista o no el correo) y elegir una contraseña nueva (cierra todas las sesiones). |
| `#/invitacion/<token>` | Crear la cuenta. Un admin configura MFA y recibe 10 códigos de respaldo que se muestran una sola vez. |
| `#/correo/<token>` | Confirmar el correo nuevo con un botón: no se confirma solo al abrir el enlace. |

**El token de un enlace se borra de la URL** con `history.replaceState` en cuanto se lee, antes de cualquier petición y aunque no sea válido. Desde ahí vive solo en memoria y viaja en el cuerpo de la petición.

**Al cambiar la sesión no se redibuja la vista si sigue siendo la misma o si es pública:** completar una invitación abre la sesión justo cuando se muestran los códigos de respaldo.

**Sin QR para el MFA por ahora:** el secreto se escribe a mano o se abre con el enlace `otpauth://`. Dibujar un QR exige una librería o una implementación propia, que no están aprobadas.

## Tu cuenta y administración

Cada sección es su propia ruta (y su propio archivo, que se mide aparte). Todas las de la cuenta son del grupo lector: las abre cualquier rol.

| Ruta | Pantalla |
|---|---|
| `#/cuenta` | Perfil: lo que se ve de la cuenta y el formulario de nombre y teléfono (E.164; vacío lo quita). Se manda solo lo que cambió. |
| `#/cuenta/foto` | Foto: se recorta en un cuadrado **en el navegador** (zoom y posición con deslizadores o arrastrando) y se sube ya recortada, a 512 px como máximo y sin agrandar. Volver a codificarla con un canvas descarta los metadatos de la cámara; el servidor igual los limpia. Un PNG sigue siendo PNG. |
| `#/cuenta/correo` | Pedir el cambio de correo con la contraseña. El servidor responde siempre lo mismo; el cambio se confirma en `#/correo/<token>`. |
| `#/cuenta/contrasena` | Cambiar la contraseña: dice cuántas sesiones de otros dispositivos se cerraron. |
| `#/cuenta/dos-pasos` | Activar la verificación en dos pasos (secreto, primer código, 10 códigos de respaldo una sola vez), generar códigos nuevos y desactivarla. Una cuenta de administración no puede desactivarla. |
| `#/cuenta/sesiones` | Sesiones abiertas (red truncada, ubicación aproximada): cerrar una, cerrar las demás o salir de esta. |
| `#/cuenta/datos` | Descargar los datos (JSON) y eliminar la cuenta. Si es propietaria de algo compartido, el 409 muestra **qué** hay que transferir, con nombres. |
| `#/cuenta-eliminada` | Despedida pública después de eliminar la cuenta: la sesión se olvida ya en esta vista, sin pasar por Entrar. |
| `#/admin` | Solo administración: invitar (nombre, correo, permisos), la lista paginada de invitaciones pendientes, reenviar y cancelar con confirmación en la fila. El enlace de invitación **nunca** llega a esta pantalla: solo lo recibe la persona invitada. |

El enlace **Administración** de la navegación se muestra solo a ese rol. Ocultarlo no es la protección: el router y el backend exigen el rol igual.

**`hidden` siempre oculta** (`[hidden] { display: none !important }` en `base.css`). Sin esa regla, una clase con `display` como `.boton` le gana al navegador y un botón "oculto" se sigue viendo y se puede pulsar.

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

**Topes aplicados, en KiB con gzip** (confirmados por escrito al cerrar H1; primera carga y rol público apretados al cerrar I):

| Medida | Tope |
|---|---|
| JS de primera carga | 12 |
| Rol público | 20 |
| Rol lector | 140 |
| Rol editor | 210 |
| Rol admin | 225 |
| Chunk más grande | 160 |
| CSS total | 30 |

**Diferidas.** Son las librerías que una vista carga bajo demanda: un envoltorio en `src/diferidas/` o un lenguaje de `@codemirror/language-data`.

- Se miden aparte del JS del rol, con lo que traen **además** de lo que ya cargó quien las pide.
- Los lenguajes se miden de uno en uno y se compara el mayor.
- Topes aplicados al cerrar H2: highlight 60 y lenguaje 35. KaTeX sigue en `null`: se decide en el bloque O.
- Mermaid queda fuera: es mejora futura, sin excepción al tope por chunk.

**Por pantalla (informativo, sin tope).** Lo que descarga abrir cada vista justo después de la primera carga: su archivo y sus importaciones estáticas, sin lo que ya trajo la primera carga. Es el peor caso: si antes se abrió otra vista que comparte código, se descarga menos.

### API y sesión (`src/api/cliente.js`, `src/sesion.js`)

- **Token solo en memoria.** El access token no se guarda en `localStorage`, `sessionStorage`, IndexedDB ni en cookies accesibles por JS (hay una prueba que lo verifica). Al recargar se pide otro con la cookie de refresco, que es httpOnly y SameSite=Strict.
- **Un solo refresco a la vez.** En la pestaña, una promesa compartida; entre pestañas, el cerrojo de Web Locks `cuaderno-refresco`. Dos refrescos simultáneos con la misma cookie cuentan como reutilización y el backend revocaría la sesión.
- **Reintento.** Un 401 `no_autenticado` refresca y reintenta **una** vez. Se refresca 30 s antes de que venza el token.
- **Errores.** Siempre son `ErrorApi` con un código estable. Si no hubo respuesta: `red` o `tiempo_agotado` (15 s). Un 429 informa cuánto esperar (`Retry-After`).
- **Cambios de sesión.** Si la sesión termina o cambian la cuenta o el rol, el router vuelve a evaluar la vista. Renovar el token no redibuja nada.

### Estados explícitos (`src/componentes/estado.js`)

`conDatos()` muestra cargando, el contenido, vacío o error.

- **"Reintentar"** repite la **petición** sin recargar la página.
- **Excepción:** una vista que no cargó por `import()` sí recarga. Chromium guarda el `import()` fallido en el mapa de módulos del documento, y solo recargar lo limpia.
- **Avisos al lector de pantalla:** los errores se anuncian en la región viva `#anuncios`.

### Service Worker (`src/sw/sw.js`)

- **Solo en el build.** El plugin de `vite.config.js` lo emite como `/sw.js`, con su versión y su lista de precarga.
- **Precarga solo el armazón:** la página, la entrada, el CSS y las vistas públicas. El código de cada rol y las fuentes se cachean al usarse: una persona lectora no descarga el editor en segundo plano.
- **Navegación:** red primero; sin red, la página de la caché. **`/assets/*`:** caché primero, con `ignoreVary`, porque el servidor responde `Vary: Origin`.
- **`/api` nunca pasa por la caché.** Tampoco lo que no es GET ni lo de otro origen.

### Fuentes autoalojadas

**Atkinson Hyperlegible Next** (texto) y **JetBrains Mono** (código), variables, desde `@fontsource-variable`.

- Se sirven del mismo origen, sin CDN.
- `unicode-range` hace que solo se descargue el subconjunto que usa la página. Para español: unos 34 KB del texto, 37 KB de su cursiva si se usa, y 40 KB del código si aparece.
- Licencia SIL OFL 1.1: va publicada junto a la app en `/licencias/`.

### Accesibilidad

- axe (WCAG 2.1 A/AA) en las pruebas de punta a punta, en los dos temas.
- El color nunca es el único medio: cada aviso nombra su estado ("Error:", "Listo:").
- Foco siempre visible.
- Enlace para saltar al contenido.
- Sin animación si el sistema pide reducir el movimiento.

### Seguridad

- Sin `innerHTML`: los nodos se crean con `h()` (`src/dom.js`), el texto entra como texto y los atributos `on*` se rechazan.
- `<meta name="referrer" content="no-referrer">`.
- **Vista renderizada del Markdown (bloque O, `src/markdown/vista.js`):**
  - el Markdown pasa por mdast con posiciones (micromark con tablas, tachado y tareas de GFM), **sin HTML**: el HTML escrito se ve como texto literal;
  - primera capa: solo se generan elementos y atributos de la lista `PERMITIDOS`;
  - segunda capa (`sanear`): vuelve a filtrar por la lista blanca, independiente de la primera;
  - enlaces solo `http`, `https`, `mailto` o un ancla `#…`, con `rel="noopener noreferrer nofollow ugc"`;
  - las imágenes **no se cargan** (un servidor ajeno vería quién lee): quedan como enlace con su descripción;
  - los títulos no llevan `id` (evita el *DOM clobbering*);
  - el DOM se construye con `createElement` y `createTextNode`;
  - el resaltado (`src/diferidas/highlight.js`) analiza el HTML de highlight.js en un documento aparte y copia solo `<span class="hljs-…">` y texto.
  - Pruebas: batería XSS unitaria (26 cargas, y la segunda capa sola) y E2E sobre el DOM real (13 cargas que marcarían `window` si se ejecutaran), con las mutaciones O01–O04.
