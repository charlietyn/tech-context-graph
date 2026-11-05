# Migraciones

Código: `src/persistence/sqlite-migration.service.ts`. Se ejecutan **en cada apertura** de la base de datos.

## Orden en `migrate`

1. `CREATE TABLE IF NOT EXISTS` de todo el esquema.
2. `ensureColumn` idempotente para columnas añadidas después.
3. `ensureMigration(version, apply)` en orden; registra en `schema_migrations`.

## Historial

| Versión | Efecto |
|---|---|
| 1, 2 | Marcadores, sin operación |
| 3 | Reescribe `graphify-out/` a `./tech-graphify-out/` en `graph_output` |
| 4 | Corrige `graph_json_path` a la ruta anidada `graphify-out/graph.json` |
| 5 | `artifact_kind='library'` para `role='library'` |
| 6 | Cores legacy con versión en la ruta → `<tech>-core-<ver>` |
| 7 | Cores legacy restantes → `<tech>-core-unknown` |
| 8 | Rellena `source_path` vacío con `path` |
| 9 | `migrateFlatGraphOutputs`: **mueve carpetas** a `technologies/<tech>/<key>` |

## Atomicidad

`openDatabase` persiste **solo después** de migrar todo, y al fallar cierra sin persistir. El SQL es efectivamente atómico.

La excepción es la migración 9, que toca disco. Por eso valida todos los destinos antes de mover nada y acepta movimientos ya completados al reintentar. Un conflicto (origen y destino existen) **impide abrir el workspace** hasta resolverlo a mano; hay un test específico.

No se hace copia de seguridad automática antes de migrar.

## Reglas

Ver [workflows/modify-database.md](../workflows/modify-database.md). Lo esencial: append-only, idempotente, y las colisiones de `repo_key` se comprueban antes de reescribir (ver migraciones 6 y 7).
