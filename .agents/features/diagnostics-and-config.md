# Feature: Diagnóstico y configuración

## `tcg doctor [--json]`

Comprueba Node, Python, Git, Graphify, marcador, YAML, `.tcg` y `tech-graphify-out`. Código de salida 1 si algo falla. Exige un workspace resuelto.

**Límites conocidos:**

- Comprueba `graphify.executable`, pero la inspección siempre lanza `graphify` ([R-07](../technical-debt/risks.md)).
- Usa `spawnSync` sin timeout.
- No comprueba `rg` (opcional).
- Python no se usa directamente en runtime.

## `tcg config:paths|show|validate`

| Comando | Salida |
|---|---|
| `config:paths [--json]` | Ubicaciones. `sqlite.getPath` no abre la base de datos |
| `config:show` | Configuración resuelta con defaults |
| `config:validate [--json]` | Valida; un YAML inválido da error y código 2 |

`config:paths` muestra rutas fijas de grafos, informes y logs, aunque `workspace.paths.*` diga otra cosa, y eso es correcto: el código **no** usa esos valores ([R-07](../technical-debt/risks.md)).

## Claves YAML con efecto real

| Clave | Lector |
|---|---|
| `persistence.file`, luego `workspace.paths.database` | `WorkspaceDatabasePathService` |
| `repository_discovery.roots` | `RepositoryRootService`, `project:refresh` |
| `projects.*` | `project:*` |
| `graphify.executable` | Solo `doctor` |
| `workspace.id`, `workspace.name` | Identidad y etiquetas |

Todo lo demás (`ui.*`, `security.*`, `graphify.semantic`, etc.) solo se valida. Ver [workflows/change-configuration.md](../workflows/change-configuration.md).

## Variables de entorno

| Variable | Efecto |
|---|---|
| `TCG_WORKSPACE` | Workspace por defecto en modo comando |
| `TCG_CONFIG_HOME` | Carpeta del registro global. Esencial para aislar pruebas |
| `TCG_KIT_ROOT` | Raíz del paquete si no se detecta (`config/`, `ignore/`) |
| `TCG_GIT_CONCURRENCY` | Workers de pull, 1 a 8, defecto 3 |
