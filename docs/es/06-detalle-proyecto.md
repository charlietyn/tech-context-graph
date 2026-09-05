# Detalle de un proyecto inspeccionado

[Anterior: Inspección](05-inspeccion-graphify.md) · [Índice](README.md) · [Siguiente: Configuración](07-configuracion.md) · [English](../en/06-project-detail.md)

Todos los repositorios aceptados aparecen en el listado de detalle. Las acciones incluyen cambiar la carpeta del código fuente, actualizar, reconstruir, consultar, explicar un nodo, buscar un camino, ver ubicaciones y retirar del catálogo activo.

Las consultas utilizan el `graph.json` específico del repositorio para evitar contexto irrelevante.

## Elegir la operación adecuada

| Operación | Cuándo utilizarla |
|---|---|
| Query | Tienes una pregunta natural sobre estructura o comportamiento |
| Explain | Necesitas contexto de un símbolo o concepto |
| Path | Sospechas que dos conceptos están conectados |
| Update | Cambió el código y puede actualizarse incrementalmente |
| Pull latest code + update graph | Quieres aplicar un fast-forward limpio desde el upstream antes de actualizar el grafo |
| Rebuild | Necesitas intencionadamente una extracción limpia |
| Cambiar carpeta del código fuente | El descubrimiento mapeó el contenedor del repositorio en vez de la carpeta que Graphify debe inspeccionar |

## Preguntas mejores y peores

Prefiere relaciones acotadas:

```text
¿Cómo pasa un candidato a repositorio aceptado?
¿Qué llama a GraphifyCliService.inspect()?
Encuentra un camino entre RepositoryRootService y RepositoryStoreService.
```

Evita preguntas sin criterio de éxito como «Cuéntame todo». Empieza con algo concreto, revisa las ubicaciones de origen y profundiza de forma iterativa.
