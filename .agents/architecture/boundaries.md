# Boundaries

## Capas

### Presentación: `src/main.ts`, `src/commands/`, `src/ui/`

- **Responsabilidad:** parsear entrada, resolver workspace, invocar un servicio, formatear salida y fijar `process.exitCode`.
- **Entradas:** argv, TTY, `TCG_WORKSPACE`.
- **Salidas:** stdout (tablas o `--json`), stderr, código de salida.
- **Puede depender de:** servicios, presenter, modelos. Hoy también del store en 4 ficheros (excepción tolerada).
- **No debe:** lanzar procesos, ejecutar SQL, ni contener decisiones de negocio.
- **Datos propios:** ninguno.

### Casos de uso: `src/services/*.service.ts`

- **Responsabilidad:** orquestar reglas de dominio sobre store, config, Git y Graphify.
- **Entradas:** siempre `workspaceRoot` explícito como primer argumento, más datos tipados.
- **Salidas:** modelos e informes tipados (`UpdateReport`, `CatalogReviewResult`, etc.). Errores como `Error` u `OperationError`.
- **No debe:** imprimir por consola ni leer `process.argv`. Excepción: `WorkspaceOnboardingService` y `PathSelectionService` **son** flujos interactivos y dependen de `ClackPromptService`.

### Motor de grafos: `graphify-cli`, `technology-graph`, `repository-fingerprint`, `graph-output-path`

- **Responsabilidad:** ejecutar Graphify, validar y publicar grafos, agregarlos, calcular frescura.
- **Datos propios:** todo lo que hay bajo `tech-graphify-out/` y el contrato de `tcg-current.json`.
- **Contrato:** solo `inspectLocked` publica. Solo `TechnologyGraphService` reubica directorios de salida.

### Primitivas: `process-runner`, `git-access`, `repository-git`, `repository-exclusions`, `operation-lock`

- **Responsabilidad:** subprocesos, confianza Git acotada, exclusión mutua.
- **Dependencias:** solo Node y otras primitivas. `RepositoryGitService` solo toma el tipo `StoredRepository`.
- **Regla:** todo subproceso pasa por `runProcess`. La única excepción actual es `DoctorCommand`, que usa `spawnSync`.

### Persistencia: `src/persistence/`

- **Responsabilidad:** ciclo de vida de SQLite, esquema, migraciones, SQL de dominio.
- **Contrato:** fuera de esta capa nadie escribe SQL. La excepción es `test/graph-publication.spec.ts`, que manipula filas para simular estados.
- **Dependencias hacia services (4 imports):** `graph-output-path` (funciones puras), `operation-lock`, `WorkspaceConfigService`.

### Modelos: `src/models/`

Solo tipos, más una función pura (`candidateToStored`). No dependen de ninguna otra capa.

## Propiedad de los datos

| Dato | Dueño | Ubicación | Quién escribe |
|---|---|---|---|
| Identidad del workspace | Marcador | `tech-context-graph.workspace.json` | `WorkspaceMarkerService` |
| Lista de workspaces de la máquina | Registro global | `%APPDATA%\TechContextGraph\workspaces.json` y equivalentes, o `TCG_CONFIG_HOME` | `GlobalWorkspaceRegistryService` |
| Configuración editable | YAML | `tech-context-graph.yaml` | `WorkspaceConfigService` |
| Raíces de búsqueda | **Compartido** YAML + SQLite | `repository_discovery.roots`, `scan_roots` | `RepositoryRootService` |
| Catálogo de repositorios | SQLite | `repositories` | `RepositoryStoreService` |
| Registro `projects` | YAML, paralelo al catálogo | `projects:` | `project:add`, `project:discover --apply` |
| Historial de inspecciones | SQLite | `inspections` | `GraphifyCliService` vía store |
| Grafo publicado | Sistema de ficheros | `<output>/tcg-current.json` + `.generations/` | `GraphifyCliService` |
| Agregado | Sistema de ficheros | `technologies/<tech>/{graph.json,aggregate.json,technology.json}` | `TechnologyGraphService` |
| Informe de escaneo | Sistema de ficheros | `context-pack/repository-discovery/` | `RepositoryDiscoveryService` |
| Catálogo de tecnologías | Paquete + override | `config/technology-catalog.yaml`, `technology-catalog.override.yaml` | Mantenedores y usuario |

**Precedencia de verdad para el estado de un grafo:** SQLite dice qué se intentó; `tcg-current.json` más su digest dicen qué es válido. `InspectionReconcileService` existe para unirlos.

## Fronteras de seguridad y confianza

- **Código fuente de terceros:** los repositorios escaneados no son de confianza. Se leen manifiestos, no se ejecutan. El escáner no sigue symlinks.
- **`safe.directory`:** la confianza Git se concede por comando y solo para la raíz real de una ruta del catálogo, nunca global ni con comodín.
- **Rutas de salida:** las reubicaciones comprueban que origen y destino están dentro de la raíz gestionada. La migración 9 además comprueba `realpath` contra junctions.
- **Perfil de ignore:** `GraphifyIgnoreService` aplica `basename()` al nombre del perfil para evitar path traversal.
- **Sin autenticación ni roles:** el control de acceso es el del sistema operativo. El equivalente a "autorización" es el estado `ACCEPTED`.
