# Lista de revisión del bloque R

Lo que hay que confirmar **antes de entregar**. Cada punto dice dónde está, por qué quedó pendiente y cómo se cierra.

## Textos que prometen funciones

El hero (`src/vistas/publico/inicio.js`) describe funciones que **todavía no existían** cuando se escribió (bloque I). Se dejaron por decisión escrita, con la condición de confirmarlas aquí.

| Texto | Función | Bloques | Cómo se confirma |
|---|---|---|---|
| "Cada versión queda guardada y se puede verificar." | historial de versiones con cadena de hash, verificable desde la interfaz | N (versiones) y Q | Guardar versiones de un documento y verificar la cadena desde la interfaz (no solo con SQL). Si no se puede verificar desde la interfaz, se cambia el texto. |
| "Un asistente que responde con tu propia documentación." | asistente de IA con búsqueda en los documentos del espacio (RAG) | P2 y Q | Preguntar algo que solo está en un documento del espacio y que la respuesta lo use y lo cite. Si no cita la fuente, se cambia el texto. |

Si alguna no queda lista, el texto se quita o se reescribe para decir solo lo que es cierto. No se entrega una promesa falsa.
