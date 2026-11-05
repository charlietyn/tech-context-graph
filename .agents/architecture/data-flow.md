# Data Flow

## Flujo completo

```mermaid
flowchart TD
    A[Raíz de búsqueda] -->|BFS + catálogo| B[RepositoryCandidate]
    B -->|saveDiscovery| C[(repositories: DETECTED)]
    B -->|writeReport| R[context-pack/]
    C -->|revisión humana| D[(ACCEPTED, enabled=1)]
    D -->|organize| E[graph_output agrupado]
    D -->|opcional --pull| F[git pull en path]
    F --> G[Fingerprint de source_path]
    D --> G
    G -->|igual a publicación| H[UNCHANGED, sin extraer]
    G -->|distinto| I[graphify extract en .generations/id]
    I --> J[Validar y volver a calcular fingerprint]
    J -->|falla| K[(FAILED, grafo anterior intacto)]
    J -->|ok| L[tcg-current.json atómico]
    L --> M[(inspections: READY)]
    M --> N[merge-graphs por tecnología]
    M --> O[graphify query/explain/path]
    O --> P[(graph_queries)]
```

## Secuencia de `repository:inspect --pull`

```mermaid
sequenceDiagram
    participant CMD as Comando o TUI
    participant UP as RepositoryUpdateService
    participant GIT as RepositoryGitService
    participant GR as GraphifyCliService
    participant ST as RepositoryStoreService
    participant TG as TechnologyGraphService
    CMD->>UP: run(workspace, repos, {pull})
    UP->>UP: lock .tcg/update.lock, exige ACCEPTED+enabled
    UP->>GIT: pull por raíz Git, agrupado por git-common-dir
    GIT-->>UP: resultado o error por raíz
    loop Secuencial por repositorio
        UP->>GR: inspect(deferAggregate)
        GR->>GR: lock output, fingerprint, ¿sin cambios?
        GR->>ST: beginInspection (RUNNING)
        GR->>GR: graphify extract, validar, publicar
        GR->>ST: completeInspection (READY o FAILED)
        GR-->>UP: resultado
    end
    loop Una vez por tecnología con algún ok
        UP->>TG: refresh(technology)
    end
    UP-->>CMD: UpdateReport + .tcg/logs/update-id.json
```

## Identidad a través del flujo

| Etapa | Forma | Convención |
|---|---|---|
| Escáner | `RepositoryCandidate` | `snake_case`, también el JSON y YAML del informe |
| Conversión | `candidateToStored()` | Cambia a `camelCase` |
| SQL | `RepositoryRow` | `snake_case`, listas como `*_json` |
| Dominio | `StoredRepository` | `camelCase`, mapeado en `mapRow` |

Añadir un campo implica tocar las cuatro formas: [workflows/modify-database.md](../workflows/modify-database.md).

## Dos rutas distintas en cada repositorio

| Campo | Uso |
|---|---|
| `path` | Identidad (único) y **donde se hace `git pull`** |
| `sourcePath` | **Lo que inspecciona Graphify** y lo que se usa para el fingerprint |

Se separan con `repository:set-source`. Confundirlos es un bug silencioso.

## Estado derivado en lectura

`inspectionStatus` no es una columna; se calcula en tres pasos:

1. `RepositoryStoreService.list`: toma el estado de la **última** inspección, o `NEVER`.
2. `mapRow`: `READY` sin `graph.json` en disco → `MISSING`.
3. `RepositoryControlService.list`/`get`: fuente ausente → `MISSING`; `READY` con fingerprint distinto → `STALE`.

Si lees directamente del store no verás `STALE` calculado. `graphJsonPath`, `nodeCount` y `edgeCount` usan `COALESCE` con la última inspección `READY`, por lo que un repositorio con estado `FAILED` conserva el grafo válido anterior.

## Efectos laterales fuera del workspace

| Efecto | Cuándo |
|---|---|
| `git pull`, `reset --keep`, `rebase`, `restore`, ref `refs/tcg/backups/*` en el repositorio | Solo con `--pull` |
| `.git/info/exclude`, `info/tcg-backups/` | Con `--pull`, o al crear un workspace dentro de un repositorio Git |
| `.graphifyignore` en el repositorio | Solo `project:prepare --write-ignore` |
| Registro global | Crear, adoptar o usar un workspace |
