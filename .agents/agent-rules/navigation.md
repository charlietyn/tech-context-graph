# Navegación

## Orden de búsqueda

`AGENTS.md` exige usar el grafo primero.

```bash
graphify query "how does pull reconcile divergence"
graphify explain "RepositoryUpdateService"
graphify path "ConsoleUiService" "RepositoryGitService"
```

Si `query` trunca, sube `--budget` o afina la pregunta.

1. `graphify query|explain|path`, con `graphify-out/graph.json`.
2. `.agents/` para contexto y reglas.
3. Lee el fuente indicado por el grafo.
4. `Grep`/`Glob` para nombres concretos.
5. `graphify-out/GRAPH_REPORT.md` solo para revisión amplia.

**El grafo orienta, no prueba.** Puede contener nodos de `dist` y documentos, y estar por detrás del working tree. Los ficheros sucios en `graphify-out/` son normales.

Después de modificar código: `graphify update .` (solo AST, sin coste de API).

## Qué leer según la tarea

| Tarea | Lee | Ficheros |
|---|---|---|
| Comando nuevo | [add-command](../workflows/add-command.md) | `src/commands/`, `src/cli.module.ts` |
| Opción de menú | [interactive-ui](../cli/interactive-ui.md) | `src/ui/console-ui.service.ts` |
| Flujo de inspección | [graph-inspection](../features/graph-inspection.md), [graph-lifecycle](../domains/graph-lifecycle.md) | `src/services/graphify-cli.service.ts` |
| Git y pull | [pull-and-update](../features/pull-and-update.md), [runtime-primitives](../modules/runtime-primitives.md) | `src/services/repository-git.service.ts`, `src/services/git-access.ts`, `src/services/repository-exclusions.ts` |
| Lote | [pull-and-update](../features/pull-and-update.md) | `src/services/repository-update.service.ts` |
| Detección | [technology-detection](../modules/technology-detection.md) | `src/services/repository-discovery.service.ts`, `src/services/repository-manifest.service.ts`, `config/technology-catalog.yaml` |
| Esquema SQL | [modify-database](../workflows/modify-database.md) | `src/persistence/*`, `src/models/repository-state.ts` |
| YAML | [change-configuration](../workflows/change-configuration.md) | `src/services/config.service.ts`, `config/tech-context-graph.schema.json` |
| Resolver workspace | [workspace](../domains/workspace.md) | `src/commands/common-options.ts`, `src/services/workspace-resolver.service.ts` |
| Agregados | [technology-aggregation](../features/technology-aggregation.md) | `src/services/technology-graph.service.ts` |
| Estado incorrecto | [freshness-and-reconcile](../features/freshness-and-reconcile.md) | `src/services/repository-control.service.ts`, `src/persistence/repository-store.service.ts` |
| Rendimiento de arranque | [freshness-and-reconcile](../features/freshness-and-reconcile.md) | `src/ui/console-ui.service.ts`, `.tcg/logs/startup.jsonl` |

## Fuentes de verdad

| Tema | Fuente |
|---|---|
| Comportamiento | Código, luego tests |
| Comandos | `node dist/main.js --help`, `src/commands/` |
| Esquema SQL | `src/persistence/sqlite-migration.service.ts` |
| YAML | `config/tech-context-graph.schema.json` |
| Tecnologías | `config/technology-catalog.yaml` |
| Intención de usuario | `docs/en/`, `docs/es/` |
| Futuro | `ROADMAP.md`; **no** es el estado actual |

## Excluir de la búsqueda

`node_modules/`, `dist/`, `tech-graphify-out/`, `graphify-out/` (salvo uso con graphify), `.tcg/`, `context-pack/`, `manual/`, `.tcg-install/`. `diagrams/` contiene `.dot` y `.svg` de documentación.

`internal-notes/` es privado, está ignorado por Git y puede estar obsoleto.

## Trampas

- `graphify-out/` es el grafo **de este repo**; `tech-graphify-out/` son grafos de los repositorios del catálogo del usuario.
- `path` ≠ `sourcePath`; `id` ≠ `key`; `project:*` (YAML) ≠ `repository:*` (SQLite).
- Hay dos implementaciones de resolución de workspace; la usada por los comandos es `resolveWorkspacePath`.
