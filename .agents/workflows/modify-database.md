# Workflow: Modificar la base de datos

Las migraciones se ejecutan al abrir y son irreversibles en los workspaces del usuario.

## Añadir una columna a `repositories`

Toca **todos** estos puntos:

| # | Lugar | Cambio |
|---|---|---|
| 1 | `SqliteMigrationService.migrate`, `CREATE TABLE` | Añade la columna, para bases nuevas |
| 2 | `SqliteMigrationService.migrate`, `ensureColumn` | Añade la llamada, para bases existentes |
| 3 | `RepositoryCandidate` | Campo `snake_case`, si procede del escáner |
| 4 | `StoredRepository` | Campo `camelCase` |
| 5 | `candidateToStored` | Mapeo |
| 6 | `RepositoryRow` en el store | Campo de fila |
| 7 | `upsertCandidate` | Columna en `INSERT`, valor, **y decisión en `ON CONFLICT`** |
| 8 | `mapRow` | Mapeo a dominio |
| 9 | `detectDirectory` y `upsertManual` | Poblar |

La pregunta clave del paso 7: **¿debe sobrevivir a un re-escaneo si el usuario lo editó?** Si es así, usa `CASE WHEN repositories.catalog_status='ACCEPTED'` como en `source_path` y `graph_output`. No repitas [R-02](../technical-debt/risks.md).

Si necesita rellenar datos antiguos, añade `ensureMigration`.

## Añadir una migración de datos

```ts
this.ensureMigration(db, 10, () => {
  db.run(`UPDATE repositories SET x='y' WHERE x IS NULL`);
});
```

Reglas:

1. **Siguiente número; nunca edites una versión previa,** ya aplicada en máquinas de usuarios.
2. **Idempotente en su lógica,** con condiciones `WHERE` precisas.
3. **Comprueba colisiones** antes de cambiar `repo_key`: patrón en las versiones 6 y 7.
4. **Síncrona:** el callback no admite `await`.
5. **Si toca disco:** valida todo antes de mover, acepta movimientos ya hechos, comprueba contención y symlinks. Patrón en `src/persistence/graph-output-migration.ts`.
6. **Un error impide abrir el workspace,** por lo que debe ser accionable.
7. No hay copia de seguridad automática. Si es destructiva, plantéala primero.

## Nueva consulta

Solo en `RepositoryStoreService`, con parámetros `?`, nunca interpolando valores. Lista de placeholders generada: patrón en `setCatalogStatus`.

## Tests

Añade un caso en `test/repository-store.service.spec.ts` o `test/graph-output-migration.spec.ts` que cree una base con el esquema **antiguo** y compruebe el resultado. Ver "migrates versioned legacy technology roots".

```powershell
npx jest test/repository-store.service.spec.ts test/graph-output-migration.spec.ts --runInBand
```

**Nunca pruebes una migración contra `.tcg/state.sqlite` de esta raíz.**
