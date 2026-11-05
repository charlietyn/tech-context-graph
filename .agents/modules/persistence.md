# Módulo: Persistencia

**Ficheros:** `src/persistence/*`. Esquema en [data/database.md](../data/database.md).

## `SqliteDatabaseService`

| Método | Comportamiento |
|---|---|
| `open(root)` | Reutiliza si es la misma ruta. Si no, cierra, toma lock, lee fichero, migra, persiste |
| `run(root, sql, params)` | Ejecuta y **exporta la BD entera** |
| `transaction(root, cb)` | `BEGIN IMMEDIATE`, callback **síncrono**, `COMMIT`, persist; `ROLLBACK` si falla |
| `all`, `get` | Lectura preparada |
| `close()` | Persiste, cierra, libera lock |
| `getPath(root)` | Solo resuelve; no abre |

`persist()` escribe `<db>.tmp` y hace `rename`. No hace fsync.

**Implicaciones:**

- Coste de cada escritura proporcional al tamaño total de la BD ([R-10](../technical-debt/risks.md)).
- Agrupa escrituras con `transaction`: varios `run` seguidos son varias exportaciones.
- El callback de `transaction` no puede usar `await`.
- Si la apertura falla, cierra **sin persistir**, por lo que las migraciones SQL parciales no quedan guardadas.

## `RepositoryStoreService`

Único dueño del SQL de dominio. `mapRow` lo convierte en `StoredRepository` y deriva `MISSING`.

**La consulta `list`** une dos veces con `inspections`: `i` es la última, `valid` la última `READY`. De ahí que un fallo conserve la ruta del grafo.

**`upsertCandidate`**, con conflicto en `path`:

| Se conserva | Se sobrescribe |
|---|---|
| `id`, `catalog_status`, `enabled`, `discovered_at` | `repo_key`, `name`, `role`, `category`, `technology`, `technology_label`, `artifact_kind`, paquete, `confidence`, `markers_json`, `ignore_profile`, etc. |
| En `ACCEPTED`: `source_path`, `graph_output` | Fuera de `ACCEPTED`: también estos |

`catalog_status` y `enabled` solo cambian al promover a `ACCEPTED`: desde `DETECTED` en un escaneo con `--apply`, y desde cualquier estado con `upsertManual` (`reopenIgnored`).

Esta tabla es la fuente de [R-02](../technical-debt/risks.md) y [R-03](../technical-debt/risks.md).

## `WorkspaceDatabasePathService`

Prioridad: `persistence.file`, luego `workspace.paths.database`, luego `./.tcg/state.sqlite`. **Crea el directorio padre** como efecto lateral.

## WASM

`initSqlJs` localiza `sql-wasm.wasm` mediante `createRequire(__filename)`. Funciona en `dist/` y en Jest.
