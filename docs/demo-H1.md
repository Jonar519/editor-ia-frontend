# Demo · Bloque H1: esqueleto del frontend

**Terminal:** `cmd.exe`, en la carpeta `editor-ia-frontend`.

Esta demo **no** toca la base ni el backend.

## 1. Preparar y abrir

```bat
cd /d "...\editor-ia\editor-ia-frontend"
git checkout main
git pull
npm ci
scripts\dev.bat
```

Abre `http://127.0.0.1:5175` en el navegador.

**Qué debes ver:** el inicio de Cuaderno con el título enfocado. La pestaña dice `Inicio · Cuaderno`.

## 2. Router y estados

| Acción | Qué debes ver |
|---|---|
| Clic en **Documentos** (sin sesión) | Te lleva a **Entrar**: lo protegido no se muestra sin sesión. |
| Escribe `http://127.0.0.1:5175/#/admin` | Lo mismo: **Entrar**. |
| Escribe `http://127.0.0.1:5175/#/no-existe` | **Página no encontrada**, con el foco en el título. |
| Recarga y presiona **Tab** una vez | Aparece **Saltar al contenido**. Con Enter, el foco pasa al contenido sin cambiar de vista. |

## 3. Tema según el sistema

En Windows: **Configuración → Personalización → Colores → Elige tu modo → Oscuro** (y luego vuelve a Claro).

**Qué debes ver:** la página cambia de tema sola, sin recargar y sin ningún botón. El tema lo decide el sistema.

## 4. Animación y movimiento

En Windows: **Configuración → Accesibilidad → Efectos visuales → Efectos de animación: desactivado**.

**Qué debes ver:** al navegar ya no hay animación de entrada. Con los efectos activados, hay una sola animación: la vista aparece en 160 ms.

## 5. Auditoría de color, contraste y presupuestos

```bat
scripts\revisar.bat
```

**Qué debes ver:**

1. `Auditoría de color: OK (R1–R7)`.
2. Los 40 pares de contraste (20 por tema) con `OK` y `Contraste AA: 40 de 40 pares cumplen`.
3. La tabla de presupuestos con `SIN TOPE CONFIRMADO` en cada medida y `Presupuestos: OK`.

Para ver que la auditoría de color detecta un problema real:

1. Abre `src\estilos\base.css`.
2. En `.boton-primario`, cambia `background-color: var(--color-acento);` por `background-color: var(--color-peligro);`.
3. Corre `npm run colores`.

**Qué debes ver:** `R5 ... --color-peligro ("Error o acción destructiva...") no se usa en background-color`. Después deshaz el cambio:

```bat
git checkout -- src\estilos\base.css
```

## 6. Pruebas

```bat
scripts\test.bat
scripts\mutar.bat H02 H09 H15 H19
scripts\e2e.bat
```

**Qué debes ver:**

- Las pruebas unitarias: todo `passed`.
- Cada mutación `DETECTADA` con su evidencia:
  - H02: sin redondeo a favor en el contraste;
  - H09: significado usado donde no corresponde;
  - H15: un tope sin confirmar no se aplica;
  - H19: guardia por rol.
- Las pruebas de punta a punta en Linux, con Chromium y Firefox, axe en los dos temas: `30 passed`. El reporte queda en `playwright-report\index.html`.

## 7. Todo lo que corre el CI

```bat
scripts\ci.bat
```

**Qué debes ver:** `RESULTADO: OK`.
