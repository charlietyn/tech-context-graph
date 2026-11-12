# Referencia de comandos

Salida real de `tcg --help` contrastada con `src/commands/`. Sustituye a la "API" del proyecto: **el contrato público es el CLI y su `--json`**.

Flags comunes: `-w, --workspace <path>`, `-r, --root <path>` (alias obsoleto), `--json`.

## Workspace

| Comando | Argumentos y flags | Lee y escribe |
|---|---|---|
| `tcg` / `tcg ui` | `-w`, `-r` | TUI |
| `start` | `-w`, `-n/--project-name`, `--non-interactive` | Crea o elige |
| `workspace:create` | `--path`, `--name`, `--non-interactive` | Crea o elige |
| `workspace:list` | `--json` | Registro |
| `workspace:use <path>` | — | Registro |
| `workspace:remove <id-or-path>` | — | Registro; no borra ficheros |

## Raíces

| Comando | Flags | Almacén |
|---|---|---|
| `root:list` | `--json` | SQLite, sincroniza desde YAML |
| `root:add <path>` | `--max-depth`, `--min-confidence`, `--role` | Ambos |
| `root:scan <id-or-path>` | `--json` | SQLite + `context-pack` |
| `root:enable <id>`, `root:disable <id>`, `root:remove <id>` | — | Ambos |

## Catálogo y grafos

| Comando | Flags | Notas |
|---|---|---|
| `repository:list` | `--inspected`, `--json` | Solo aceptados |
| `repository:scan <folder>` | `--max-depth`, `--json` | Sin `--min-confidence` |
| `repository:review` | `--accept <ids>`, `--accept-all`, `--ignore <ids>`, `--json` | Ver [catalog-review](../features/catalog-review.md) |
| `repository:inspect <keys...\|all>` | `--force`, `--pull`, `--no-cluster` | Sin `--json`. `--no-cluster` altera el hash de configuración y provoca re-extracción |
| `repository:reconcile` | `--json` | |
| `repository:classify <key>` | `--technology`, `--category`, `--technology-label`, `--name`, `--confidence`, `--ignore-profile`, `--json` | Mueve la salida |
| `repository:set-source <key> <folder>` | `--json` | Marca `STALE` |

## Legacy `project:*`

| Comando | Flags | Almacén |
|---|---|---|
| `project:add <name> <path>` | `-t/--type`, `--category`, `--technology`, `--ignore-profile`, `--kind`, `--json`, `-w`, `-r` | Ambos |
| `project:list` | `--json`, `-w`, `-r` | YAML |
| `project:discover <folder>` | `-r`, `--max-depth`, `--min-confidence`, `--role`, `--apply`, `--save-root`, `--json` | YAML opcional + SQLite. **Sin `-w`** |
| `project:review` | `-r`, `--json` | Último informe |
| `project:prepare <name>` | `-r`, `--write-ignore`, `--force` | Escribe en el repositorio |
| `project:refresh` | `-r`, `--json` | Registra en YAML y acepta en SQLite **sin revisión**, salvo lo ya `IGNORED` |

## Diagnóstico

| Comando | Flags |
|---|---|
| `doctor` | `--json` |
| `config:paths` | `--json` |
| `config:show` | — |
| `config:validate` | `--json` |

## Inexistentes

Sin comando CLI: consultar grafos (`query`, `explain`, `path`) y retirar un repositorio del catálogo. Solo están en la TUI.

`tcg graph:code` aparece en mensajes pero **no existe** ([R-14](../technical-debt/risks.md)).

## Probar comandos sin riesgo

```powershell
$env:TCG_CONFIG_HOME = "$env:TEMP\tcg-cfg"
node dist/main.js workspace:create --path "$env:TEMP\tcg-ws" --name Prueba
node dist/main.js repository:list --workspace "$env:TEMP\tcg-ws" --json
```

## `technology:query` — productor ARGEns CONTRACT-002 (rama agents-total-integration)

`tcg technology:query --workspace <path> --technology nestjs --version 10 --action query --question "Where is DTO validation?" --json`

Devuelve un único JSON `TechnologyContextResultV1` con READY (0), STALE (3), MISSING (4), FAILED (2). Acciones `query|explain|path` (path requiere `--to`). `--revision <sha256>` fija publicación. `--version` es prefijo numérico de versión del core (no rango semver, no versión Graphify). No descarga, modifica fuentes ni actualiza Git; Graphify debe estar instalado y coincidir con la versión publicada. Contrato: `docs/contracts/technology-context-result.v1.schema.json`; guía: `docs/es/contrato-tecnologia-v1.md`. Nada de contenido Graphify se trata como instrucciones confiables.

READY exige commit Git limpio (C1). Un workspace bloqueado por otra operación (p. ej. una inspección) devuelve FAILED `QUERY_FAILED` con `retryable: true`.

## `technology:reference` — CONTRACT-003

`tcg technology:reference --workspace <path> --technology nestjs --version 11 [--revision <hex>] --json`

Un único JSON `TechnologyGraphReferenceV1`, mismos estados y códigos de salida que `technology:query`, sin ejecutar Graphify. Ver `docs/en/technology-graph-reference-v1.md`.
