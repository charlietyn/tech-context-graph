# Módulo: Primitivas de runtime

Infraestructura de bajo nivel. Son pequeñas, muy reutilizadas y con alto radio de daño.

## `src/services/process-runner.ts`

`runProcess(command, args, options)` resuelve **solo cuando el hijo se ha cerrado**, incluso tras cancelación o timeout.

| Comportamiento | Detalle |
|---|---|
| Shell | `shell: false`, siempre |
| Timeout por defecto | 120 s; error `TIMEOUT` |
| Límite de salida | 64 MiB entre stdout y stderr; `OUTPUT_LIMIT` |
| Cancelación | `AbortSignal` → `CANCELLED`. Sin signal, escucha SIGINT y SIGTERM |
| Matar | Windows: `taskkill /T /F`. Unix: `SIGKILL` al grupo (`detached`) |
| No arranca | `PROCESS_START` |
| Exit ≠ 0 | **No lanza**: devuelve `exitCode`. El llamador decide |
| Líneas | `onLine` por línea con decodificación UTF-8 segura; si lanza, mata al hijo |

`OperationError(code, message)` vive aquí y es el tipo de error de dominio.

## `src/services/git-access.ts`

| Función | Uso |
|---|---|
| `gitRoot(path)` | Busca `.git` subiendo desde `realpath`. Sin subproceso |
| `runGit(path, args, opts)` | **Único** modo de llamar a Git en producción |
| `requireGit(result, context)` | Devuelve stdout o lanza `OperationError` clasificado |
| `classifyGitError(detail)` | Mapea stderr a código. **Depende del orden y del idioma inglés de Git** |
| `scopedGitEnvironment(path)` | Pasa `safe.directory` a los Git que lanza Graphify, vía `GIT_CONFIG_*` |

`runGit` fuerza: `-c safe.directory=<raíz real>`, `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, `GIT_OPTIONAL_LOCKS=0`.

## `src/services/operation-lock.ts`

`acquireLockSync(path)` crea el lock con `wx` y guarda `{pid, token, createdAt}`. Devuelve la función de liberación, que comprueba el token.

Si el lock ya existe, toma `<path>.recovery`, lee el PID y prueba con `process.kill(pid, 0)`. Solo si da `ESRCH` borra y reintenta. Cualquier otra cosa: `LOCKED`.

| Lock | Ubicación | Duración |
|---|---|---|
| Base de datos | `<db>.lock` | **Toda la sesión** |
| Coordinador y reconcile | `.tcg/update.lock` | Una operación |
| Inspección | `<output>/.tcg-inspection.lock` | Una extracción |
| Pull | `<git-common-dir>/tcg-update.lock` | Un pull |

**Por el lock de sesión, un segundo `tcg` sobre el mismo workspace falla con `LOCKED` mientras la TUI esté abierta.** Es por diseño.

## `src/services/repository-exclusions.ts`

`prepareExclusions` y `appendLocalExcludes`: ver [features/pull-and-update.md](../features/pull-and-update.md).

## `src/services/graph-output-path.ts`

Rutas de salida como funciones puras. `canonicalGraphOutput` traduce el prefijo legacy `graphify-out/` a `./tech-graphify-out/`. **Usa siempre estas funciones**; no construyas rutas de salida a mano.
