# Feature: Consulta del grafo

**Propósito:** hacer preguntas a un grafo publicado.

| Aspecto | Detalle |
|---|---|
| Entrada | **Solo TUI:** menú 5 → proyecto → Query, Explain, Path. No hay comando `tcg` |
| Código | `GraphifyCliService.query`, `ConsoleUiService.queryFlow/pathFlow` |
| Persistencia | `graph_queries` |
| Tests | Sin cobertura directa de `query` |

## Flujo

```text
graphPath = repository.graphJsonPath si existe, si no resolveGraphPath(output)
sin graph.json → "This repository does not have an available graph.json"
graphify query|explain <input> --graph <path>
graphify path <a> <b> --graph <path>
timeout 120 s
store.recordQuery (éxito o fallo, con duración)
```

`resolveGraphPath` busca, en orden: la publicación, `<output>/graph.json` (legacy) y `<output>/graphify-out/graph.json`.

## Efectos laterales

Cada consulta guarda el **texto completo de la salida** en `graph_queries.output_text`. Ningún código lo lee, `query_log_disabled` no lo desactiva, y hace crecer la base de datos que se reexporta en cada escritura ([R-09](../technical-debt/risks.md), [R-07](../technical-debt/risks.md)).

## Para agentes que trabajen en este repo

Eso es distinto a consultar el grafo **de este repositorio**, que se hace directamente: ver [navigation.md](../agent-rules/navigation.md).
