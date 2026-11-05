# Feature: Onboarding de workspace

**Propósito:** crear, abrir, adoptar o cambiar el workspace activo sin asumir rutas.

| Aspecto | Detalle |
|---|---|
| Entradas | `tcg`, `tcg ui`, `tcg start`, `workspace:create`, `workspace:use`, `workspace:list`, `workspace:remove` |
| Módulos | `src/main.ts`, `workspace-onboarding`, `workspace-initializer`, `workspace-marker`, `workspace-resolver`, `global-workspace-registry`, `path-selection` |
| Persistencia | Marcador, YAML, SQLite, registro global |
| Autorización | Ninguna; permisos del sistema operativo |
| Tests | `workspace-onboarding`, `workspace-resolver`, `path-selection`, `config.service` |

## Flujo interactivo

```text
main.ts (sin args, TTY)
 → ¿--workspace? resolver.fromPath  /  si no onboarding.chooseOrCreate
     sin workspaces → firstRun: crear | abrir | salir
     con workspaces → autocomplete: elegir | crear | abrir | salir
 → ConsoleUiService.run(path)
 → resultado SWITCH_WORKSPACE → repite el bucle
```

**Crear:** nombre → `PathSelectionService.selectDirectory` → resumen → confirmación → `initializer.create`.

**Abrir:** con marcador se registra. Sin marcador pero legacy se ofrece adoptar. En otro caso, error.

## Flujo no interactivo

```bash
tcg workspace:create --path <dir> --name <nombre>
tcg start --non-interactive --workspace <dir> --project-name <nombre>
```

Ambos llaman a `WorkspaceInitializerService.create`, que es idempotente respecto al marcador existente.

## Efectos laterales

- Crea el árbol de directorios y migra la base de datos.
- Si está dentro de un repositorio Git, ejecuta `prepareExclusions`.
- Actualiza `lastWorkspaceId` y `recentPaths` en el registro global.

## Errores esperables

| Mensaje | Causa |
|---|---|
| `No workspace is selected` | Sin flag, variable, marcador ni registro |
| `The folder is not a Tech Context Graph workspace` | Falta el marcador |
| `Invalid workspace configuration` | El YAML viola el schema |
| `TCG_CANCELLED` (interno) | Ctrl+C en un prompt; termina con código 0 |

## Notas

`ConsoleUiService.run` lanza `TCG_CANCELLED` capturado como `EXIT`. Las opciones Back devuelven `undefined`, y los tests cubren que vuelvan al menú anterior.
