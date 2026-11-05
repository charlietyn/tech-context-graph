# Feature: Mantenimiento de repositorios

## Corregir clasificación: `repository:classify <key> --technology <id> --category <cat>`

`RepositoryControlService.classify` → `store.updateClassification` → `organize` (mueve la salida a la tecnología nueva) → `get`. Añade el marcador `manual:<technology>`.

**Aviso:** un re-escaneo posterior sobrescribe esta corrección ([R-02](../technical-debt/risks.md)).

## Cambiar carpeta de fuente: `repository:set-source <key> <folder>`

`RepositoryControlService.setSourcePath`:

1. Valida el directorio.
2. `store.updateSourcePath`: cambia `source_path` y pasa la última inspección `READY` a `STALE`, en una transacción.
3. `config.setProjectSourcePath`, si existe en YAML.

`key`, `path` y el directorio de pull **no cambian**. Graphify y el fingerprint usarán la carpeta nueva. Cubierto en `repository-store.service.spec.ts` y `config.service.spec.ts`.

## Registro manual: `project:add <name> <path> [--kind auto] [--type] [--category] [--technology]`

`ProjectAddCommand` contiene lógica propia:

1. Valida el directorio. Con `--kind auto`, `detectRepository` y falla si no puede clasificar.
2. Con detección, **la key detectada sustituye a `<name>`**.
3. Rechaza una key existente para otra ruta, y elimina entradas de YAML con otra key para la misma ruta.
4. Escribe YAML, luego `store.upsertManual` (`ACCEPTED`), luego `organize`.

Si la ruta ya existía como `DETECTED` o `IGNORED`, pasa a `ACCEPTED`: nombrar una ruta concreta es una decisión humana.

**Límite conocido:** `--kind core|library|application` se anuncia pero solo `auto` tiene efecto ([R-16](../technical-debt/risks.md)).

## Quitar del catálogo: menú 5 → *Remove from active catalog*

`store.disable`: `enabled=0`, `IGNORED`. No borra repositorio ni grafo. No hay comando CLI.

## Instalar ignores: `project:prepare <name> --write-ignore [--force]`

Escribe `.graphifyignore` en el **repositorio del usuario**, combinando `common` y el perfil. Con `--force` deja copia `.tcg-backup`. Lee `projects` del YAML, por lo que solo ve lo registrado ahí.

## Comandos `project:*` frente a `repository:*`

| | `project:*` | `repository:*` |
|---|---|---|
| Fuente | YAML `projects` (salvo descubrimiento, que escribe en ambos) | SQLite |
| Estado | Legacy, compatibilidad | Camino principal |
| Flag de workspace | `-r` en discover, review, prepare y refresh; `-w` solo en add y list | `-w` y `-r` |

`project:list` y `repository:list` pueden mostrar resultados distintos ([R-15](../technical-debt/risks.md)). **Para funcionalidad nueva usa `repository:*`.**
