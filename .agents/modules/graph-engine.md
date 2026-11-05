# Módulo: Motor de grafos

**Ficheros:** `src/services/graphify-cli.service.ts`, `src/services/repository-update.service.ts`, `src/services/technology-graph.service.ts`, `src/services/inspection-reconcile.service.ts`, `src/services/repository-fingerprint.service.ts`, `src/services/graph-output-path.ts`, `src/services/graphify-ignore.service.ts`.

Comportamiento en [domains/graph-lifecycle.md](../domains/graph-lifecycle.md), [features/graph-inspection.md](../features/graph-inspection.md) y [features/technology-aggregation.md](../features/technology-aggregation.md).

## API de `GraphifyCliService`

| Método | Uso |
|---|---|
| `inspect(workspace, repo, opts)` | Único punto de publicación. Usa el coordinador, no lo llames desde presentación |
| `query(workspace, repo, action, input, second?)` | Consultas |
| `version()`, `isAvailable()`, `invalidateVersion()` | Caché de 60 s por PATH |
| `graphCounts(path)` | Valida y cuenta |
| `removeDanglingEdges(path)` | Repara; solo sobre generación sin publicar |
| `resolveGraphPath(output)`, `readPublication(output)` | Localización |

## Funciones puras exportadas y testeadas

`graphSummaryFromLine`, `graphifyProgressFromLine`, `describeExitFailure`, `canonicalGraphOutput`, `resolveGraphOutput`, `technologyGraphOutput`, `technologyMemberGraphOutput`, `repositoryGraphOutput`.

## Formato aceptado de `graph.json`

Nodos en `nodes` o `elements.nodes`. Aristas en `links`, `edges` o `elements.edges`. Extremos en `source`/`target` o `from`/`to`, con id directo u objeto `{id}`.

**Asimetría:** `TechnologyGraphService.refresh` solo acepta `nodes` y `links`/`edges`, no `elements.*`.

## Esquema de `tcg-current.json`

```json
{
  "schema": 2,
  "inspectionId": "uuid",
  "fingerprint": "git-v2:...",
  "configuration": "sha256",
  "graphifyVersion": "graphify 0.9.74",
  "graph": ".generations/<id>/graphify-out/graph.json",
  "graphDigest": "sha256",
  "clustered": true,
  "communityCount": 12,
  "publishedAt": "ISO-8601"
}
```

## Reglas de cambio

- **Si cambias la semántica de extracción, sube `schema` en el hash de configuración** de `inspectLocked` para forzar re-extracción.
- **Parsear la salida de Graphify es frágil:** cada regex tiene test. Añade la línea real como caso.
- La regex de resumen ancla en `graph.json:` porque las rutas de Windows tienen `:`.
- Los códigos de Windows llegan como DWORD sin signo; `describeExitFailure` los traduce.
- Registrar la inspección (`beginInspection`) antes de crear el stream de log permite que un fallo temprano quede atribuido.
