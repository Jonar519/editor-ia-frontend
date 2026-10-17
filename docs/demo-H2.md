# Demo · Bloque H2: estados, cliente del API, Service Worker y fuentes

**Terminal:** `cmd.exe`.

Esta demo **no** escribe en tu base: solo inicia sesión con una cuenta que ya existe. Si no tienes una, créala con la demo E (pasos 2 a 4) usando `luis.demo@example.com`. El formulario de inicio de sesión llega en el bloque I: aquí la sesión se abre con `curl` y el navegador la recupera con la cookie.

## 1. Preparar

```bat
cd /d "...\editor-ia\editor-ia-backend"
scripts\dev.bat
```

En **otra** ventana:

```bat
cd /d "...\editor-ia\editor-ia-frontend"
git checkout main
git pull
npm ci
npm run build
npm run preview
```

Abre `http://127.0.0.1:5175`. Se usa el **build** (`preview`), porque el Service Worker solo existe ahí.

## 2. Sin sesión

Abre `http://127.0.0.1:5175/#/cuenta`.

**Qué debes ver:** te lleva a **Entrar**. En las herramientas del navegador (F12 → Red) hay un `POST /api/auth/refresco` con 401: al abrir la página se intentó recuperar la sesión con la cookie y no había.

## 3. Con sesión (cookie de refresco)

El navegador recibe la cookie al iniciar sesión **desde la misma página**. Por ahora (sin formulario) se hace desde la consola del navegador (F12 → Consola), en `http://127.0.0.1:5175`:

```js
await fetch('/api/auth/sesion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correo: 'luis.demo@example.com', contrasena: 'la contraseña de la demo' }) }).then((r) => r.status)
```

Debe responder `201`. Después recarga la página y abre `#/cuenta`.

**Qué debes ver:**

- Tu perfil (nombre, correo, permisos).
- En F12 → Red: un `POST /api/auth/refresco` (200) y un `GET /api/cuenta` con la cabecera `Authorization: Bearer ...`.
- En F12 → Aplicación → Almacenamiento local, de sesión e IndexedDB: **nada**. El token vive solo en memoria.
- La cookie `cuaderno_refresco` aparece como **HttpOnly**: JavaScript no puede leerla.

## 4. Error y "Reintentar" sin recargar

Detén el backend (Ctrl+C en su ventana) y recarga `#/cuenta`.

**Qué debes ver:** "No se pudo cargar tu perfil..." y el botón **Reintentar**.

Vuelve a arrancar el backend (`scripts\dev.bat`) y presiona **Reintentar**.

**Qué debes ver:** el perfil aparece **sin que la página se recargue**. En F12 → Red hay un nuevo `GET /api/cuenta`, pero no un documento nuevo.

> Si al detener el backend la sesión ya no se recupera, inicia sesión otra vez (paso 3).

## 5. Service Worker y sin red

1. En F12 → Aplicación → Service Workers, `sw.js` está **activado**.
2. En la pestaña Red, marca **Sin conexión** y recarga `http://127.0.0.1:5175/`.

**Qué debes ver:** el inicio de Cuaderno abre igual (desde la caché).

En F12 → Aplicación → Almacenamiento en caché, `cuaderno-<versión>` tiene la página, la entrada, el CSS y las vistas públicas. **No** tiene nada de `/api` ni el código del editor o de administración.

Desmarca **Sin conexión** al terminar.

## 6. Fuentes autoalojadas

En F12 → Red, filtra por **Fuente** y recarga.

**Qué debes ver:** los `.woff2` llegan de `127.0.0.1:5175/assets/`, sin ningún dominio externo. Para el inicio basta `atkinson-hyperlegible-next-latin-wght-normal-...woff2`.

Las licencias están en `http://127.0.0.1:5175/licencias/atkinson-hyperlegible-next-OFL.txt` y `.../jetbrains-mono-OFL.txt`.

## 7. Revisiones y pruebas

```bat
scripts\revisar.bat
scripts\test.bat
scripts\mutar.bat H27 H28 H31 H35 H38 H39
scripts\e2e.bat
```

**Qué debes ver:**

- **`revisar.bat`:**
  - auditoría de color OK y 40 de 40 pares de contraste;
  - presupuestos con los 7 topes **aplicados** (`OK (tope ...)`) y las diferidas `SIN TOPE CONFIRMADO`.
- **Mutaciones:** cada una `DETECTADA`:
  - H27: un solo refresco a la vez;
  - H28: sin bucle de reintentos;
  - H31: cerrojo entre pestañas;
  - H35: `/api` fuera de la caché;
  - H38: `ignoreVary`;
  - H39: precarga solo del armazón.
- **Pruebas de punta a punta:** con el API simulado, en Linux, Chromium y Firefox: `passed`. Se salta solo la de abrir sin red en Firefox, por una limitación de Playwright.

## 8. Todo lo que corre el CI

```bat
scripts\ci.bat
```

**Qué debes ver:** `RESULTADO: OK`.
