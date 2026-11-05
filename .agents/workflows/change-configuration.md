# Workflow: Cambiar la configuración YAML

## Añadir una clave

1. `config/tech-context-graph.schema.json`: define tipo. Varias secciones tienen `additionalProperties: false`.
2. `WorkspaceConfigService.mergeDefaults`: default. Las secciones se fusionan superficialmente.
3. **Código que la lea.** Hay muchas claves declaradas sin lector ([R-07](../technical-debt/risks.md)); no añadas otra.
4. `config/tech-context-graph.example.yaml`.
5. `CONFIGURATION_REFERENCE.md` y `CONFIGURATION_REFERENCE_ES.md`.
6. Test en `test/config.service.spec.ts`.

## Renombrar una clave

`migrateLegacyConfiguration` mueve la antigua, **antes** de validar. Conserva el nombre antiguo en el test. `version` sigue en 4 salvo un cambio incompatible, que exigiría tocar la `const` del schema.

## Antes de leer una clave

Comprueba que tiene efecto:

```bash
graphify explain "WorkspaceConfigService"
```

Busca en `src/` la clave concreta.

## Cuidado

- `save` reescribe el fichero entero y elimina los comentarios del usuario.
- Un schema más estricto puede **invalidar YAML existente** e impedir abrir el workspace: `load` lanza. Relaja o migra.
- `load` devuelve un clon: `load`, mutar, `save`.
- Escribir con `save` valida; editar a mano se valida en el siguiente `load`.
- El catálogo de tecnologías **no** es esta configuración: [add-technology-profile.md](add-technology-profile.md).
