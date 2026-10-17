# Demo · Bloque I: entrada y acceso

**Terminal:** `cmd.exe`.

**Ojo:** esta demo **escribe en tu base de desarrollo** porque la haces tú. Crea una cuenta admin de demostración, sus sesiones y sus eventos.

**Datos:** solo ficticios (`@example.com`).

**Valores del backend:** su `.env` tiene que tener `APP_URL=http://127.0.0.1:5175` y `COOKIE_SECURE=true` (los dos vienen así de `env-init`).

## 1. Preparar

```bat
cd /d "...\editor-ia\editor-ia-backend"
git checkout main
git pull
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

Abre `http://127.0.0.1:5175`.

## 2. Hero

**Qué debes ver:**

- "Cuaderno", la frase, las tres ideas, un solo botón **Entrar** y la nota de las invitaciones.
- A la derecha, la ilustración con el título "Ilustración de ejemplo: no es un documento real.". No hay cifras, nombres ni fechas.

Ahora la micro-interacción: presiona **Tab** hasta llegar a **Otra persona** y presiona **Enter**.

**Qué debes ver:** aparece "Otra persona está editando este párrafo". Con **Espacio** se oculta. Si en Windows apagaste los efectos de animación (Accesibilidad → Efectos visuales), aparece sin animación.

## 3. Completar una invitación de admin (con MFA)

```bat
cd /d "...\editor-ia\editor-ia-backend"
scripts\invitar.bat --correo marta.demo@example.com --nombre "Marta Ficticia" --rol admin
scripts\buzon.bat marta.demo@example.com
```

Abre en el navegador el enlace `http://127.0.0.1:5175/#/invitacion/...` del correo.

**Qué debes ver:**

1. La barra de direcciones queda en `#/invitacion`: **el token desapareció** al leerlo.
2. "Hola, Marta Ficticia..." y el formulario.
3. El secreto de la verificación en dos pasos, en grupos de 4.

Elige una contraseña (12 caracteres o más) y agrega el secreto en tu app autenticadora. Si no tienes una, usa `scripts\totp.bat <secreto sin espacios>` en la carpeta del backend. Escribe el primer código y presiona **Crear la cuenta**.

**Qué debes ver:**

- **Guarda tus códigos de respaldo**, con 10 códigos que **no desaparecen** aunque la sesión ya se abrió (arriba aparecen "Tu cuenta" y "Salir").
- **Continuar** está deshabilitado hasta marcar "Ya los guardé". Si intentas cerrar la pestaña antes, el navegador pregunta.

Guarda uno de los códigos para el paso 5.

## 4. La sesión sobrevive a una recarga

Marca "Ya los guardé", presiona **Continuar** y luego recarga la página (F5).

**Qué debes ver:**

- Sigues en **Documentos**, con sesión: el navegador guardó la cookie `Secure` sobre `http://127.0.0.1`.
- En F12 → Aplicación, el almacenamiento local y el de sesión están **vacíos**.

## 5. Salir y entrar en dos pasos

1. Presiona **Salir**.
2. Abre `http://127.0.0.1:5175/#/cuenta`: te manda a **Entrar**.
3. Escribe correo y contraseña.
4. En el segundo paso usa **un código de respaldo** ("Usar un código de respaldo"). Se puede escribir en minúsculas y sin guion.

**Qué debes ver:** entras y llegas a **Tu cuenta**, la sección que querías abrir, con "Verificación en dos pasos: Activa".

Repite con el **mismo** código de respaldo.

**Qué debes ver:** "El código no es válido o el paso venció...". Vuelves al primer paso con el correo ya escrito.

## 6. Recuperar la contraseña

1. Presiona **Salir**.
2. En Entrar, presiona "¿Olvidaste tu contraseña?".
3. Escribe `marta.demo@example.com` y luego `nadie.demo@example.com`.

**Qué debes ver:** el mismo mensaje en los dos casos.

```bat
scripts\buzon.bat marta.demo@example.com
```

Abre el enlace `#/recuperar/...`.

**Qué debes ver:** la barra queda en `#/recuperar` (sin token).

Prueba `aaaaaaaaaaaaaaaa`.

**Qué debes ver:** "La contraseña no cumple la política" y el motivo.

Luego una frase válida.

**Qué debes ver:** "Tu contraseña cambió y se cerraron todas tus sesiones.".

## 7. Pruebas

```bat
cd /d "...\editor-ia\editor-ia-frontend"
scripts\test.bat
scripts\mutar.bat H42 H43 H44 H45
scripts\e2e.bat
scripts\ci.bat
```

**Qué debes ver:**

- Todo `passed`. Cada mutación `DETECTADA`:
  - H42: el token se borra de la URL;
  - H43 y H44: los códigos de respaldo no se borran al abrir la sesión;
  - H45: después de entrar, nunca se redirige fuera de Cuaderno.
- `RESULTADO: OK`.
