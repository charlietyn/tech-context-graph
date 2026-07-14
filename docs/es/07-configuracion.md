# Modelo de configuración

La intención editable vive en `tech-context-graph.yaml`. El historial operativo vive en `.tcg/state.sqlite`. La lista de workspaces vive en el registro global del sistema operativo. La identidad vive en `tech-context-graph.workspace.json`.

```bash
tcg config:paths
tcg config:show
```

## Directorios de ejecución que no deben publicarse

| Directorio | Propósito |
|---|---|
| `context-pack/` | Informes generados de descubrimiento y artefactos de contexto |
| `tech-graphify-out/` | Salidas administradas de Graphify |
| `graphify-out/` | Salida de Graphify para este repositorio fuente |
| `.tcg/` | Estado operativo SQLite y logs |

Estos directorios corresponden a un workspace local concreto y pueden contener información generada o sensible. El repositorio fuente los excluye. La documentación estable pertenece a `docs/`.

La carpeta raíz `internal-notes/` también está excluida. Conserva localmente planes de migración terminados, evaluaciones de diseño y notas que no forman parte de la documentación pública del producto.
