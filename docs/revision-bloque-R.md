# Lista de revisión del bloque R

Lo que hay que confirmar **antes de entregar**. Cada punto dice dónde está, por qué quedó pendiente y cómo se cierra.

## Textos que prometen funciones

El hero (`src/vistas/publico/inicio.js`) describe funciones que **todavía no existían** cuando se escribió (bloque I). Se dejaron por decisión escrita, con la condición de confirmarlas aquí.

| Texto | Función | Bloques | Cómo se confirma |
|---|---|---|---|
| "Cada versión queda guardada y se puede verificar." | historial de versiones con cadena de hash, verificable desde la interfaz | N (versiones) y Q | Guardar versiones de un documento y verificar la cadena desde la interfaz (no solo con SQL). Si no se puede verificar desde la interfaz, se cambia el texto. |
| "Un asistente que responde con tu propia documentación." | asistente de IA con búsqueda en los documentos del espacio (RAG) | P2 y Q | Preguntar algo que solo está en un documento del espacio y que la respuesta lo use y lo cite. Si no cita la fuente, se cambia el texto. |

Si alguna no queda lista, el texto se quita o se reescribe para decir solo lo que es cierto. No se entrega una promesa falsa.

**Decisión escrita (cierre del bloque I):** las dos ideas se quedan por ahora. Si los bloques N, P2 y Q no llegan a existir antes de la entrega, **se quitan**.

## Sin medir al cerrar el tramo 2 (pruebas manuales al final)

Anotado por escrito al cerrar el bloque J. Se prueban a mano con la guía consolidada.

| Qué | Por qué quedó sin medir | Cómo se cierra |
|---|---|---|
| Recodificación del avatar con fotos reales de cámara en Firefox | La E2E usa un PNG generado; la prueba en vivo con JPEG fue en Chrome | Subir en Firefox una foto de teléfono con GPS: se ve bien recortada y la exportación no trae metadatos |
| Safari | Las E2E corren en Chromium y Firefox | Recorrer las demos H1 a J en Safari |
| Olvidar la sesión después de eliminar la cuenta | Lo cubre solo la E2E, sin mutación | Demo J, paso 9: recargar después de eliminar y ver que no hay sesión |
| Foco en las confirmaciones (cancelar invitación, eliminar cuenta) | Lo cubre solo la E2E, sin mutación | Demo J, pasos 8 y 9, solo con el teclado |

## Para el despliegue

| Qué | Por qué | Cómo se cierra |
|---|---|---|
| CSP con `worker-src 'self'` | La comparación de versiones (bloque N) corre en un Web Worker propio (`src/diff/trabajador.js`); una CSP sin `worker-src` (o con un `default-src` que no lo permita) lo bloquea | En la CSP del despliegue: `worker-src 'self'`. Se prueba comparando dos versiones en el sitio desplegado. |
| Riesgo R-02: versiones sin tope | Abuso de almacenamiento (ver `docs/modelo-amenazas.md` del backend) | Revisar con el monitoreo del tamaño de la base; decidir si hace falta cuota o retención. |

## Pendientes reabribles si queda tiempo

| Tema | Estado | Cómo se reabre |
|---|---|---|
| QR para configurar el MFA | Sin QR por ahora (decisión del cierre del bloque I). El secreto se escribe a mano o se abre con `otpauth://`. | Con una librería o una implementación propia, con su medición contra el tope del rol y aprobación escrita. |
