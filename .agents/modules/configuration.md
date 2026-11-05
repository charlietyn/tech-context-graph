# Módulo: Configuración

**Ficheros:** `src/services/config.service.ts`, `src/services/config-validation.service.ts`, `config/tech-context-graph.schema.json`, `config/tech-context-graph.example.yaml`. Referencia de usuario: `CONFIGURATION_REFERENCE.md`.

## Ciclo de `load(root)`

```text
stat (mtime, ctime, size) → ¿caché válida? → structuredClone
parseYaml → migrateLegacyConfiguration → mergeDefaults → validate → cachea
```

**Devuelve un clon:** modificar el resultado no altera la caché. El patrón siempre es `load`, mutar, `save`.

`save` valida antes de escribir, escribe temporal + `rename` e invalida la caché. **Reescribe el fichero entero: se pierden los comentarios** que tuviera el usuario.

## Migraciones en caliente

`migrateLegacyConfiguration` mueve `security.disable_query_log` a `graphify.query_log_disabled`, y `paths.graphify_out` y `paths.context_pack` a `graphs` y `reports`. Es en memoria; se persiste en el siguiente `save`.

## Schema

JSON Schema 2020-12 con Ajv en `strict`. `version` debe ser exactamente `4`. `ui`, `security`, `persistence`, `workspace.paths` y las raíces no admiten propiedades adicionales.

**Dependencia de layout:** el schema se busca en `__dirname/../../config/`. Funciona desde `src/services` y `dist/services`. Si cambias la estructura de `dist/`, se rompe.

## Sobre `repository_discovery`

`additionalProperties: true` aquí. Los valores `default_*` y `maximum_directories` se validan pero **no los lee el escáner**, que usa `catalog.settings` ([R-08](../technical-debt/risks.md)).

## Código muerto

`configureStart` no tiene llamadores.
