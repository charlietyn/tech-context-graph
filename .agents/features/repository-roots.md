# Feature: Raíces de búsqueda

**Propósito:** declarar explícitamente qué árboles de carpetas se pueden escanear. Solo se guarda la ruta; la carpeta no se modifica.

| Aspecto | Detalle |
|---|---|
| Entradas | `root:list`, `root:add`, `root:scan`, `root:enable`, `root:disable`, `root:remove`; menú 6 |
| Código | `src/commands/root.commands.ts`, `src/services/repository-root.service.ts` |
| Persistencia | **Ambos:** `scan_roots` y `repository_discovery.roots` en YAML |
| Tests | **Ninguno:** ningún spec referencia `RepositoryRootService` |

## Flujo

```text
root:add → valida directorio → store.upsertRoot → config.upsertRepositoryRoot → devuelve registro
root:list → store.roots + sincroniza YAML→SQLite (solo si la ruta existe) → store.roots
root:scan → busca por id o ruta → exige enabled → RepositoryControlService.scan
root:enable|disable|remove → exige id exacto → escribe SQLite y YAML
```

## Reglas

- Defaults al añadir: profundidad 7, confianza 60, rol `technology`.
- `id` = `ROOT-<sha1>` de la ruta normalizada.
- `root:scan` acepta id o ruta; `enable`, `disable` y `remove` **solo id**.
- Quitar una raíz **no** borra repositorios detectados ni grafos.

## Efectos y límites conocidos

- La sincronización es en un solo sentido (YAML → SQLite) y al listar.
- `repository:scan <folder>` hace upsert en `scan_roots` pero no en YAML ([R-15](../technical-debt/risks.md)).
- Las escrituras no son atómicas entre almacenes: si falla el YAML, SQLite ya cambió.

## Errores esperables

`Repository root does not exist or is not a directory`, `Repository root not found`, `Repository root is disabled`, `Repository root is not configured`.
