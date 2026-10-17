# Demo · Bloque J: cuenta y administración

**Terminal:** `cmd.exe`.

**Ojo:** esta demo **escribe en tu base de desarrollo** porque la haces tú: cambia el perfil, la foto, el correo y la contraseña de una cuenta de demostración, crea invitaciones y elimina una cuenta. El paso 9 (opcional) además inserta un espacio de ejemplo con SQL.

**Datos:** solo ficticios (`@example.com`).

**Cuenta:** la admin de la demo del bloque I (`marta.demo@example.com`, con verificación en dos pasos). Si no la tienes, sigue los pasos 1 y 3 de [demo-I.md](demo-I.md).

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

Abre `http://127.0.0.1:5175`, entra con Marta y presiona **Tu cuenta**.

## 2. Perfil

**Qué debes ver:** el correo, los permisos ("Administración"), "Verificación en dos pasos: Activa", la fecha de creación y, arriba, la navegación de la cuenta con **Perfil** marcado.

En **Teléfono** escribe `55 1234 5678` y presiona **Guardar los cambios**.

**Qué debes ver:** "Error: Escríbelo en formato internacional..." en el campo, sin llamar al servidor.

Escribe `+1 555 010 0000` y guarda.

**Qué debes ver:** "Listo: Guardamos tus cambios." y el campo queda como `+15550100000`.

## 3. Foto (recorte en el navegador)

Presiona **Foto** y elige una foto JPEG o PNG del teléfono o de la cámara.

**Qué debes ver:** una vista previa redonda y tres deslizadores: **Zoom**, **Posición horizontal** y **Posición vertical**. Funcionan con el teclado (flechas, Inicio, Fin) y también arrastrando la vista previa.

Presiona **Guardar la foto**.

**Qué debes ver:** "Listo: Guardamos tu foto nueva." y la foto arriba, en **Foto actual**. En F12 → Red, el `PUT /api/cuenta/avatar` manda un cuadrado de 512 px como máximo (o el lado menor de la foto, si es más chica: no se agranda).

Una foto con ubicación GPS no la conserva: el navegador la vuelve a dibujar sin metadatos, y el servidor también los limpia.

Elige un `.gif`.

**Qué debes ver:** "Error: Elige una imagen JPEG o PNG." y nada se sube.

## 4. Cambiar el correo

Presiona **Correo**. Escribe `marta.demo@example.com` (el mismo).

**Qué debes ver:** "Error: Ese ya es tu correo." en el campo.

Escribe `marta.nueva@example.com`, tu contraseña, y presiona **Enviar el enlace**.

**Qué debes ver:** "Listo: Si la dirección está disponible, te enviamos un enlace..." y que tu correo actual sigue funcionando.

```bat
cd /d "...\editor-ia\editor-ia-backend"
scripts\buzon.bat marta.nueva@example.com
```

Abre el enlace `#/correo/...` y presiona **Confirmar el cambio**. Vuelve a **Tu cuenta**.

**Qué debes ver:** el correo nuevo. Desde ahora Marta entra con `marta.nueva@example.com`.

## 5. Contraseña y sesiones

Abre `http://127.0.0.1:5175` en **otro navegador** (o en una ventana privada) y entra con Marta. Así hay dos sesiones.

En el primer navegador presiona **Sesiones**.

**Qué debes ver:** "2 sesiones abiertas". La de este navegador dice **Este dispositivo**; cada una muestra la red truncada (por ejemplo `127.0.0.0/24`), nunca la IP completa.

Presiona **Contraseña**. Prueba como contraseña nueva tu propio correo.

**Qué debes ver:** "Error: La contraseña no cumple la política" y el motivo.

Cambia a una frase válida.

**Qué debes ver:** "Listo: Cambiamos tu contraseña y cerramos 1 sesión en otros dispositivos.". En el otro navegador, la siguiente acción te manda a **Entrar**.

## 6. Verificación en dos pasos

Presiona **Verificación en dos pasos**.

**Qué debes ver:** "Está activa", el formulario **Códigos de respaldo** y, en **Desactivar**, que para administración es obligatoria (no hay botón para desactivarla).

Escribe el código de tu app (o `scripts\totp.bat <secreto>` en el backend) y presiona **Generar códigos nuevos**.

**Qué debes ver:** 10 códigos nuevos, una sola vez, con **Continuar** deshabilitado hasta marcar "Ya los guardé". Los anteriores dejan de servir.

## 7. Descargar tus datos

Presiona **Tus datos**, escribe tu contraseña y presiona **Descargar mis datos**.

**Qué debes ver:** se descarga `cuaderno-datos-AAAA-MM-DD.json`. Ábrelo: trae el perfil con el correo y el teléfono nuevos, la foto en base64, las sesiones, el historial de seguridad y el uso del asistente.

## 8. Administración

Presiona **Administración** (solo aparece para ese rol).

**Qué debes ver:** el formulario **Invitar a una persona** y la lista de invitaciones pendientes, paginada de 20 en 20 ("1 a 20 de ...", **Siguientes**). Una vencida lo dice con texto: "Venció: hay que reenviarla".

1. Invita a `Leo Demo`, `leo.demo@example.com`, permisos **Edición**.
2. Invita a `Mia Demo`, `mia.demo@example.com`, permisos **Lectura**.

**Qué debes ver:** "Listo: Invitamos a ...". En F12 → Red, ni la respuesta ni la lista traen el enlace o el token: solo lo recibe la persona invitada.

3. En la fila de Leo presiona **Reenviar**: "Listo: Reenviamos la invitación...".
4. En la fila de Mia presiona **Cancelar la invitación**. Aparece la pregunta; presiona **No** y el foco vuelve al botón. Repite y presiona **Sí, cancelarla**.

```bat
scripts\buzon.bat mia.demo@example.com
```

Abre el enlace de Mia.

**Qué debes ver:** el enlace ya no sirve ("El enlace no es válido o ya se usó").

## 9. Eliminar una cuenta (con el 409)

Presiona **Salir**. Abre el enlace de Leo (`scripts\buzon.bat leo.demo@example.com`) y crea su cuenta.

**Opcional, para ver el 409:** esto inserta en **tu base de desarrollo** un espacio donde Leo es propietario y Marta integrante. Abre psql contra `cuaderno` y pega:

```sql
DO $$
DECLARE leo uuid; marta uuid; esp uuid; doc uuid;
BEGIN
  SELECT id INTO STRICT leo FROM usuarios WHERE correo = 'leo.demo@example.com';
  SELECT id INTO STRICT marta FROM usuarios WHERE correo = 'marta.nueva@example.com';
  INSERT INTO espacios (nombre, creado_por) VALUES ('Equipo de demo', leo) RETURNING id INTO esp;
  INSERT INTO miembros_espacio (espacio_id, usuario_id, rol) VALUES (esp, leo, 'propietario'), (esp, marta, 'lector');
  INSERT INTO documentos (espacio_id, titulo, creado_por) VALUES (esp, 'Guía de demo', leo) RETURNING id INTO doc;
  INSERT INTO permisos_documento (documento_id, espacio_id, usuario_id, rol) VALUES (doc, esp, leo, 'propietario');
END $$;
```

Con Leo, presiona **Tu cuenta** → **Tus datos**. En **Eliminar tu cuenta** escribe su contraseña y presiona **Eliminar mi cuenta** sin marcar la casilla.

**Qué debes ver:** "Marca «Entiendo que no se puede deshacer» para continuar.".

Marca la casilla y vuelve a presionar.

**Qué debes ver** (si hiciste el paso opcional): "Error: Eres propietaria o propietario de contenido con otros colaboradores..." y la lista **Documento: Guía de demo** y **Espacio: Equipo de demo**. La cuenta sigue intacta.

Para "transferir" en la demo, saca a Marta del espacio en psql:

```sql
DELETE FROM miembros_espacio
WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = 'marta.nueva@example.com')
  AND espacio_id = (SELECT id FROM espacios WHERE nombre = 'Equipo de demo');
```

Vuelve a presionar **Eliminar mi cuenta**.

**Qué debes ver:** **Tu cuenta se eliminó**, con cuántos espacios y documentos se borraron, y en la navegación **Entrar** (ya sin sesión). Recarga: sigues sin sesión. Leo ya no puede entrar.

## 10. Pruebas

```bat
cd /d "...\editor-ia\editor-ia-frontend"
scripts\test.bat
scripts\mutar.bat H51 H52 H53 H56 H61 H63
scripts\e2e.bat
scripts\ci.bat
```

**Qué debes ver:**

- Todo `passed`. Cada mutación `DETECTADA`:
  - H51 a H53: el recorte nunca sale de la imagen, el zoom tiene límites y un PNG se sube como PNG;
  - H56: la lista del 409 muestra solo entradas válidas;
  - H61: `hidden` siempre oculta;
  - H63: la despedida después de eliminar la cuenta es pública.
- `RESULTADO: OK`.
