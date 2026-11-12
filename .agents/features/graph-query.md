# Feature: Consulta del grafo

**Propósito:** hacer preguntas a un grafo publicado.

| Aspecto | Detalle |
|---|---|
| Entrada | TUI menú 5 → proyecto → Query/Explain/Path y CLI automatizable `tcg technology:query --json --technology ... --version ...` |
| Código | `GraphifyCliService.query`, `ConsoleUiService.queryFlow/pathFlow` |
| Persistencia | `graph_queries` |
| Tests | Solo los argumentos de `query`, en `graph-output-migration.spec.ts`, con la ejecución simulada |

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

## Tecnología v1 — CONTRACT-002

La CLI de la rama `agents-total-integration` consulta un **core aprobado y versionado**, valida el puntero inmutable, SHA-256 y fingerprint, e impide mezclar agregados de versiones. `TechnologyQueryService` y `PublishedGraphResolverService` solo devuelven conocimiento técnico; jamás aprueban UC/AC ni autorizan agentes. Contrato JSON y fixtures en `test/fixtures/contracts/technology-context/v1/`, documentación `docs/es/contrato-tecnologia-v1.md` y `docs/en/technology-contract-v1.md`.

READY exige además commit Git limpio (C1) y `technology:reference` devuelve la referencia común CONTRACT-003 sin ejecutar Graphify. La salida Graphify no estructurada se marca INDEX, sin archivos/líneas inventados. La nueva entrada automatizada no registra prompts ni outputs. La TUI solo guarda contenido con opt-in explícito `graphify.query_log_disabled: false`; los registros se truncan.
