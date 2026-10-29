# Lista de revisión del bloque R

Lo que hay que confirmar **antes de entregar**. Cada punto dice dónde está, por qué quedó pendiente y cómo se cierra.

**Al día en R10 (28-10-2026).** Resumen:

| Tema | Estado |
|---|---|
| [Textos del hero](#textos-que-prometen-funciones) | Cerrado en R1: los tres textos dicen solo lo que existe |
| [CSP](#csp) | Hecha en R2 como `<meta>`; lo que falta pasa al despliegue (R-06) |
| [Sin medir](#sin-medir-al-cerrar-el-tramo-2) | **Sigue sin medir.** Queda declarado, no cerrado |
| [Dependencias](#dependencias-r-05-y-fast-uri) | R-05 y fast-uri se revisan en R11 (2-11 y 5-11-2026) |
| [Pasa al despliegue](#pasa-al-despliegue) | R-02, R-03, R-04, R-06 y R-07, sin hacer: en R no hay despliegue |
| [Reabribles](#pendientes-reabribles-si-queda-tiempo) | El QR del MFA, sin cambios |

## Textos que prometen funciones

El hero (`src/vistas/publico/inicio.js`) describe funciones que **todavía no existían** cuando se escribió (bloque I). Se dejaron por decisión escrita, con la condición de confirmarlas aquí. Si alguna no quedaba lista, el texto se quitaba o se reescribía para decir solo lo que es cierto: no se entrega una promesa falsa.

| Texto | Función | Bloques | Estado |
|---|---|---|---|
| «Escriban juntos, en tiempo real.» | edición simultánea con cursores con nombre | L | **Queda.** E2E `editor.spec.mjs` con dos personas y mutaciones front L01–L03 |
| «Cada versión queda guardada y se puede verificar.» | historial de versiones con cadena de hash, verificable desde la interfaz | N y R1 | **Queda** (R1) |
| «Un asistente que explica, resume y mejora tu documentación, y busca por significado en tu espacio.» | Explicar, Resumir y Mejorar (Q) y la búsqueda semántica del espacio (P2) | P2 y Q | **Se reescribió en R1.** Antes decía «Un asistente que responde con tu propia documentación.» |

**Resultado (R1):**
- **Versiones: queda.** «Verificar la cadena» está en el historial, para cualquier rol: la base recalcula todas las versiones y la interfaz dice «íntegra» o «alterada desde la versión N». Lo respaldan una prueba de integración que manipula una versión con el dueño de la base, una E2E y mutaciones (backend R01–R03, frontend R01–R02).
- **Asistente: se reescribió** por decisión escrita. No responde preguntas con citas de otros documentos, y el texto ya no lo promete. La E2E del hero fija los tres textos.

**Verificado en vivo en R9**, con la [guía de demostración](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/guia-demostracion.md) desde un clon limpio, contra una base y un Redis aparte:
- una versión guardada en la interfaz dio «íntegra»;
- después de cambiar la fila con `psql` como dueño de la base (desactivando el trigger de solo inserción), la interfaz dijo «alterada desde la versión 1»;
- Resumir respondió en streaming con el proveedor simulado;
- la búsqueda del espacio devolvió resultados con `curl`. La búsqueda desde la interfaz no se recorrió en vivo; la cubre la E2E `ia.spec.mjs` («buscar por significado»).

**Decisión escrita (cierre del bloque I):** las ideas se quedaban solo si los bloques N, P2 y Q existían antes de la entrega. Existen: la decisión está cumplida.

## CSP

| Qué | Estado |
|---|---|
| La CSP del build | **Hecha en R2.** Va como `<meta>` en el `index.html` del build (`scripts/lib/csp.mjs`): `script-src 'self'` sin `'unsafe-inline'` ni `'unsafe-eval'`, y `img-src`, `font-src` y `connect-src` en `'self'`. La respaldan la prueba unitaria `csp.test.mjs`, las mutaciones front R03–R05 y la E2E `csp.spec.mjs`. Las E2E juntan las violaciones de todas las navegaciones: cualquier violación hace fallar la prueba. |
| `worker-src 'self'` | **Hecho en R2.** La comparación de versiones (bloque N) corre en un Web Worker propio (`src/diff/trabajador.js`), y la E2E compara versiones bajo la CSP. |
| `'unsafe-inline'` en los estilos | **Aceptado en R2 (riesgo R-06).** Solo en `style-src-elem` y `style-src-attr`, por CodeMirror y la presencia de `y-codemirror.next`. Ver [Pasa al despliegue](#pasa-al-despliegue). |
| `frame-ancestors 'none'` | **Pasa al despliegue.** No funciona en `<meta>`: va por cabecera. |

**No verificado en vivo en R9:** la consola sin violaciones con `npm run build` y `npm run preview`. Lo cubre la E2E `csp.spec.mjs`, que corre en el CI sobre el build.

## Sin medir al cerrar el tramo 2

Anotado por escrito al cerrar el bloque J. La intención era probarlo a mano con la guía consolidada. **La guía (R9) no lo midió: lo declara** en su sección [«Lo no medido o no cubierto»](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/guia-demostracion.md#10-lo-no-medido-o-no-cubierto). Sigue abierto, y se entrega así salvo que alguien lo pruebe a mano.

| Qué | Por qué quedó sin medir | Cómo se cierra |
|---|---|---|
| Recodificación del avatar con fotos reales de cámara en Firefox | La E2E usa un PNG generado; la prueba en vivo con JPEG fue en Chrome | Subir en Firefox una foto de teléfono con GPS: se ve bien recortada y la exportación no trae metadatos |
| Safari | Las E2E corren en Chromium y Firefox, y no hay un equipo con Safari | Recorrer las demos H1 a J en Safari |
| Olvidar la sesión después de eliminar la cuenta | Lo cubre solo la E2E, sin mutación | Demo J, paso 9: recargar después de eliminar y ver que no hay sesión |
| Foco en las confirmaciones (cancelar invitación, eliminar cuenta) | Lo cubre solo la E2E, sin mutación | Demo J, pasos 8 y 9, solo con el teclado |

## Dependencias (R-05 y fast-uri)

Las dos están en el backend y se revisan en **R11**. El frontend y la base no tienen avisos de `npm audit`.

| Qué | Estado | Cuándo se cierra |
|---|---|---|
| **R-05:** `body-parser` 2.4.0 y `qs` 6.16.1 con overrides exactos, por una excepción escrita a la regla de los 14 días (aviso alto GHSA-27r3-jxmh-p828) | Aceptado el 23-10-2026. Además, `inflate: false` en los dos parsers: un cuerpo comprimido recibe 415 sin descomprimirse (mutaciones back B01–B03) | **5-11-2026**, cuando body-parser 2.4.0 cumple 14 días. Los overrides se quitan cuando Express traiga por sí solo una versión parcheada con 14 días o más |
| **fast-uri** 3.1.8: aviso moderado, solo de desarrollo (GHSA-w74x-v6f9-j3xg y otros tres) | `npm audit` lo muestra y el CI pasa, porque su umbral es `high` | **2-11-2026**, cuando la versión corregida (3.1.9) cumple 14 días |

Detalle en el [ADR 0008](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/adr/0008-dependencias.md) y en R-05 del [modelo de amenazas](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/modelo-amenazas.md#r-05--dependencias-publicadas-hace-menos-de-14-días-excepción-por-ghsa-27r3-jxmh-p828) del backend.

## Pasa al despliegue

En R no hay despliegue (decisión escrita). Nada de esto está hecho; todo queda escrito para quien despliegue. La lista completa, con los secretos que se regeneran y lo que hace que producción se niegue a arrancar, está en «Antes del despliegue» del [README general](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/README-general.md).

| Riesgo | Qué hay que hacer al desplegar | Estado |
|---|---|---|
| [**R-06:** `'unsafe-inline'` en los estilos de la CSP](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/modelo-amenazas.md#r-06--inyección-de-css-unsafe-inline-en-los-estilos-de-la-csp) | Mandar la CSP **por cabecera**, con `frame-ancestors 'none'`. Un nonce por respuesta, entregado a CodeMirror con `EditorView.cspNonce`, en lugar de `'unsafe-inline'` en `style-src-elem`. La presencia seguiría pidiendo `style-src-attr`, o `'unsafe-hashes'` con los hashes de sus atributos. | Aceptado en R2 |
| [**R-02:** versiones sin tope ni retención](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/modelo-amenazas.md#r-02--abuso-de-almacenamiento-por-versiones-sin-tope) | Antes de abrir el servicio, una alerta sobre `pg_total_relation_size('versiones')` y el tamaño de la base. Referencia medida en R4: una cuenta editora puede sumar hasta 534,5 MiB por hora. Si salta, se ve quién guardó (`versiones.creado_por`) y se decide la cuota o la retención. | Aceptado sin tope en R4 |
| [**R-07:** muchas cuentas o pedidos sin token](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/modelo-amenazas.md#r-07--un-solo-proceso-del-api-frente-a-muchos-pedidos-límite-general-por-cuenta-desde-r4) | Un límite por IP en el proxy inverso, delante del API. El API ya limita 600 pedidos por minuto y cuenta, pero eso no frena a muchas cuentas a la vez ni los pedidos sin token. | Mitigado por cuenta en R4; lo demás, aceptado |
| [**R-03:** el tráfico con el servicio de IA](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/modelo-amenazas.md#r-03--tráfico-entre-el-api-y-el-servicio-de-ia-con-ia_red_privadatrue) | Elegir entre TLS mutuo (`IA_TLS_*`) y una red privada concreta. Con `IA_RED_PRIVADA=true`, el token y el contenido viajan en texto plano, y nada comprueba que la red sea de verdad privada. | Abierto |
| [**R-04:** inyección de prompts desde un documento compartido](https://github.com/Jonar519/editor-ia-backend/blob/main/docs/modelo-amenazas.md#r-04--inyección-de-prompts-desde-un-documento-compartido) | Correr la batería de 20 cargas contra el modelo real que se elija, porque en R no hay IA real. Falta también un aviso en la interfaz de que la respuesta se basa en el contenido del documento. | Abierto |

Además, del lado del frontend:
- **Servir el build con HTTPS** y la cabecera de la CSP. `APP_URL` tiene que ser `https://`: producción se niega a arrancar si no.
- **Una sola instancia del API** (bloque K2): el documento abierto en tiempo real vive en la memoria del proceso.

## Pendientes reabribles si queda tiempo

| Tema | Estado | Cómo se reabre |
|---|---|---|
| QR para configurar el MFA | Sin QR por ahora (decisión del cierre del bloque I). El secreto se escribe a mano o se abre con `otpauth://`. | Con una librería o una implementación propia, con su medición contra el tope del rol y aprobación escrita. |
