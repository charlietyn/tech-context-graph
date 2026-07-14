# Detalle de un proyecto inspeccionado

[Anterior: Inspección](05-inspeccion-graphify.md) · [Índice](README.md) · [Siguiente: Configuración](07-configuracion.md) · [English](../en/06-project-detail.md)

Después de intentar una inspección, el repositorio aparece en el listado de detalle. Las acciones incluyen actualizar, reconstruir, consultar, explicar un nodo, buscar un camino, ver ubicaciones y retirar del catálogo activo.

Las consultas utilizan el `graph.json` específico del repositorio para evitar contexto irrelevante.

## Elegir la operación adecuada

| Operación | Cuándo utilizarla |
|---|---|
| Query | Tienes una pregunta natural sobre estructura o comportamiento |
| Explain | Necesitas contexto de un símbolo o concepto |
| Path | Sospechas que dos conceptos están conectados |
| Update | Cambió el código y puede actualizarse incrementalmente |
| Rebuild | Necesitas intencionadamente una extracción limpia |

## Preguntas mejores y peores

Prefiere relaciones acotadas:

```text
¿Cómo pasa un candidato a repositorio aceptado?
¿Qué llama a GraphifyCliService.inspect()?
Encuentra un camino entre RepositoryRootService y RepositoryStoreService.
```

Evita preguntas sin criterio de éxito como «Cuéntame todo». Empieza con algo concreto, revisa las ubicaciones de origen y profundiza de forma iterativa.
