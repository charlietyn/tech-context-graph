# Feature: Inspección con Graphify

**Propósito:** generar y publicar un grafo válido para un repositorio, evitando trabajo si nada cambió.

| Aspecto | Detalle |
|---|---|
| Entradas | `repository:inspect <keys...\|all> [--force]`, menú 3, detalle de proyecto en menú 5 |
| Código | `GraphifyCliService.inspect/inspectLocked` y, siempre por encima, `RepositoryUpdateService` |
| Persistencia | `inspections`, `.generations/`, `tcg-current.json`, `.tcg/logs/inspection-*.log` |
| Tests | `graph-publication.spec.ts`, `graphify-cli.service.spec.ts`, `repository-inspect.command.spec.ts` |

## Flujo de `inspectLocked`

1. **Lock** `<output>/.tcg-inspection.lock`.
2. **Precondiciones:** `sourcePath` existe, `graphify` disponible.
3. **Hash de configuración** (`schema`, fuente, ignores, versión, `noCluster ?? 'auto-10000'`, `codeOnly`).
4. **Fingerprint** de la fuente.
5. **Validar la publicación anterior** por digest y aristas colgantes.
6. **Atajo:** si coincide todo y no hay `--force`, devuelve `unchanged`.
7. **Nueva generación** `.generations/<runId>/` y log.
8. **Detección de capacidades** con `graphify --help` (`incremental`, `--out`).
9. **Siembra incremental:** copia la generación anterior si es válida y misma configuración.
10. **Clustering:** se omite si hay `noCluster` o si `rg --files` cuenta ≥ 10 000 ficheros.
11. `store.beginInspection`: marca como `FAILED` cualquier `RUNNING` previo e inserta el nuevo.
12. **Ejecutar:**
    ```text
    graphify extract <sourcePath> --code-only --out <gen> [--exclude p]... [--force] [--no-cluster]
    ```
13. **Reintento por memoria:** si la salida contiene `MemoryError` o `BrokenProcessPool`, reintenta una vez con `--max-workers 2`.
14. **Validar:** `graphCounts`, reparar aristas colgantes con aviso importante, y volver a validar.
15. **Fingerprint de nuevo:** si cambió → `SOURCE_CHANGED`.
16. **Comprobar cancelación.**
17. **Publicar:** temporal + `rename` de `tcg-current.json`.
18. `store.completeInspection('READY')`.
19. **Agregado**, salvo `deferAggregate`. El coordinador siempre lo difiere.

Ante cualquier error en los pasos 12–18: `completeInspection('FAILED')`, se relanza y el grafo anterior sigue publicado.

## Exclusiones

`GraphifyIgnoreService.patterns(profile)` une `ignore/common.graphifyignore` y `ignore/<profile>.graphifyignore`, y las pasa como `--exclude`. **Cambiarlas altera el hash de configuración y fuerza re-extracción de todos los repositorios afectados.**

Graphify además respeta el `.graphifyignore` del propio repositorio, que entra en el fingerprint.

## Siempre AST

`--code-only` está fijo: sin coste de LLM. `graphify.code_only` y `graphify.semantic` del YAML no tienen efecto ([R-07](../technical-debt/risks.md)).

## Errores esperables

| Código o mensaje | Causa | Resultado |
|---|---|---|
| `Graphify is unavailable.` | No está en PATH | `FAILED` sin fila de inspección |
| `Source folder missing` | Fuente movida | `FAILED` |
| `LOCKED` | Otra inspección en esa salida | `BLOCKED` |
| `EMPTY_GRAPH` | Sin símbolos de código | `SKIPPED`, con fila `FAILED` ([R-17](../technical-debt/risks.md)) |
| `SOURCE_CHANGED` | Edición durante la extracción | `FAILED`, grafo conservado |
| `CANCELLED`, `TIMEOUT` (30 min), `OUTPUT_LIMIT` (64 MiB) | Proceso | `CANCELLED` o `FAILED` |
| `Graphify crashed with code ...` | Traducido por `describeExitFailure` | `FAILED` |
| `Invalid graph...` | Grafo mal formado | `FAILED` |

**Sin `--no-cluster`, `noCluster` debe quedar `undefined`.** Pasar `false` cambia el hash de configuración (`noCluster ?? 'auto-10000'`) y re-extrae todos los grafos.
