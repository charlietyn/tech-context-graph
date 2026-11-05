# Dominio: Workspace

Un **workspace** es la carpeta de control que guarda estado, configuración y grafos. Los repositorios permanecen donde están.

## Conceptos

| Término | Definición | Código |
|---|---|---|
| Marcador | `tech-context-graph.workspace.json`; lo que hace que una carpeta sea workspace | `WorkspaceMarker`, `WorkspaceMarkerService` |
| Registro global | Workspaces conocidos por la máquina, último usado y rutas recientes | `WorkspaceRegistry`, `GlobalWorkspaceRegistryService` |
| Workspace legacy | Tiene `.tcg/state.sqlite` o YAML pero no marcador; se puede adoptar | `isLegacyWorkspace` |
| Resolución | Elegir el workspace de un comando | `resolveWorkspacePath` |

## Precedencia de resolución (modo comando)

`src/commands/common-options.ts`:

1. `--workspace` / `-w`
2. `--root` / `-r` (alias obsoleto)
3. `TCG_WORKSPACE`
4. Marcador buscando hacia arriba desde el cwd, hasta 16 niveles
5. Último workspace del registro global
6. Error

**Trampa:** en modo interactivo, `main.ts` solo lee los flags; `TCG_WORKSPACE` se ignora y se abre el onboarding.

`WorkspaceResolverService` reimplementa una lógica similar y además actualiza el registro. Los comandos normales usan `resolveWorkspacePath`, que **no** lo actualiza. Ver [R-13](../technical-debt/risks.md).

## Ubicación del registro global

| Plataforma | Ruta |
|---|---|
| Override | `$TCG_CONFIG_HOME/workspaces.json` |
| Windows | `%APPDATA%\TechContextGraph\workspaces.json` |
| macOS | `~/Library/Application Support/TechContextGraph/workspaces.json` |
| Linux | `$XDG_CONFIG_HOME/tech-context-graph/workspaces.json` o `~/.config/...` |

## Invariantes

- Un workspace exige un marcador con `id` y `name`.
- **No hay suposiciones de ruta silenciosas:** sin marcador ni registro se falla, nunca se adopta el cwd.
- Un solo proceso posee la base de datos del workspace a la vez (`state.sqlite.lock`) hasta cerrar la sesión.
- `workspace:remove` solo quita la referencia; nunca borra ficheros.
- Un registro global corrupto se trata como vacío, sin error.

## Estructura creada

`WorkspaceInitializerService.create`: `.tcg/logs`, `tech-graphify-out/technologies`, `context-pack/repository-discovery`, marcador, YAML, SQLite migrado. Si el workspace está dentro de un repositorio Git, añade exclusiones locales.
