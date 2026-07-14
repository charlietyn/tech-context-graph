# Visión general

[Índice de documentación](README.md) · [Siguiente: Primer arranque](01-primer-arranque.md) · [English](../en/00-overview.md)

## La idea central

Tech Context Graph es un plano de control local para grafos de conocimiento de software. Permite mantener un catálogo revisado de repositorios y decidir cuándo Graphify debe construir o actualizar el grafo de cada uno.

Su utilidad se entiende mejor como una secuencia:

```text
carpetas de repositorios sin organizar
  -> descubrimiento basado en evidencias
  -> revisión humana
  -> catálogo aceptado
  -> inspección con Graphify
  -> grafo con estado de vigencia
  -> preguntas fundamentadas en el proyecto
```

El proyecto no reemplaza Graphify. Graphify realiza la extracción, construcción, navegación, visualización y exposición MCP opcional del grafo. Tech Context Graph aporta disciplina operativa para múltiples repositorios: rutas explícitas, aprobación, estados, historial, logs y acciones repetibles.

## Por qué un grafo ayuda a una IA

Los modelos de lenguaje razonan a partir del contexto que reciben. Si ese contexto es una colección arbitraria de archivos, el modelo debe descubrir primero la estructura antes de resolver el problema. Además, puede omitir relaciones que solo resultan visibles al combinar varios archivos.

Un grafo proporciona un mapa compacto:

- los nodos identifican entidades relevantes;
- las aristas registran relaciones;
- las comunidades agrupan áreas relacionadas;
- las ubicaciones de origen conectan las respuestas con evidencias;
- el estado del grafo indica si el mapa está actualizado.

El grafo no convierte al modelo en infalible. Reduce incertidumbre evitable y le proporciona un mejor punto de partida.

## Ejemplo completo para principiantes

Ana se incorpora a un equipo que mantiene una tienda en línea. Recibe un error: los pedidos cancelados siguen generando una notificación de envío.

Sin contexto del proyecto, podría buscar `cancel order notification bug` y obtener consejos genéricos. Con el grafo puede preguntar:

```text
Encuentra un camino entre CancelOrderHandler y ShipmentNotificationPublisher.
```

El grafo puede revelar:

```text
CancelOrderHandler
  -> OrderService.cancel()
  -> OrderCancelledEvent
  -> EventBus
  -> ShipmentNotificationSubscriber
  -> ShipmentNotificationPublisher
```

Ana ya dispone de una hipótesis comprobable: quizá el suscriptor no filtra correctamente los pedidos cancelados. Todavía debe leer el código y ejecutar pruebas, pero comienza en el lugar adecuado.

## Cuatro estados diferentes

Quienes empiezan suelen unir conceptos que el sistema separa deliberadamente:

1. **Estado del sistema de archivos:** ¿existe la carpeta del repositorio?
2. **Estado del catálogo:** ¿solo fue detectado o una persona lo aceptó?
3. **Estado de inspección:** ¿el grafo se construyó correctamente y está vigente?
4. **Calidad del conocimiento:** ¿el grafo contiene evidencia suficiente para responder una pregunta concreta?

Un repositorio puede estar aceptado pero nunca inspeccionado. Un grafo puede existir pero estar desactualizado. Un grafo vigente puede no contener una relación que el extractor no pudo demostrar. Estas diferencias evitan una falsa sensación de certeza.

## Principios de diseño

- **No se adivinan rutas personales.** Cada workspace y raíz de búsqueda se elige explícitamente.
- **La detección es una propuesta.** Un escaneo nunca se convierte silenciosamente en aprobación.
- **La evidencia tiene más valor que el nombre de una carpeta.** Los archivos y dependencias reconocidos sustentan la clasificación.
- **El estado del catálogo y el del grafo son independientes.** La realidad operativa permanece visible.
- **Las decisiones humanas son reversibles.** Quitar un repositorio del catálogo activo no elimina su código.
- **El código fuente conserva la autoridad.** El grafo es un índice, no sustituye al código ni a las pruebas.
- **La presentación está separada de los servicios.** La CLI puede evolucionar sin mezclar la lógica de aplicación con los prompts.

## Cuándo resulta útil

Tech Context Graph encaja bien cuando existen varios repositorios locales, se necesitan construcciones repetibles, importa saber qué grafos están desactualizados o se desea que herramientas de IA consulten la estructura específica del proyecto.

Puede ser excesivo para un único repositorio pequeño que se comprende en pocos minutos. La buena ingeniería también consiste en saber cuándo no añadir infraestructura.

Siguiente paso: [ejecutar la aplicación por primera vez](01-primer-arranque.md).
