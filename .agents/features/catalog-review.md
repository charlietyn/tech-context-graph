# Feature: Revisión del catálogo

**Propósito:** puerta humana entre detectar e inspeccionar.

| Aspecto | Detalle |
|---|---|
| Entradas | `repository:review [--accept-all \| --accept <ids> --ignore <ids>] [--json]`, menú 2 |
| Código | `src/commands/catalog.commands.ts`, `src/services/catalog-review.service.ts`, `TechnologyGraphService.organize` |
| Persistencia | `repositories.catalog_status`, `enabled`, `graph_output`; `technology.json` |
| Tests | `catalog-review.service.spec.ts`, `repository-review.command.spec.ts` |

## Camino único

La TUI, `--accept-all`, `--accept` e `--ignore` usan `CatalogReviewService.apply`.

## Flujo de `apply`

```text
busca el id entre los DETECTED, y si no, en cualquier estado
para cada solicitud:
  si no existe → failed
  si ya está en ese estado → éxito sin cambios
  setCatalogStatus
  si ACCEPTED → organize(tecnología)
     si falla → restaura el estado anterior, failed
  onItem(progreso)
devuelve {items, accepted, ignored, failed}
```

Buscar en cualquier estado permite revisar decisiones: `--accept` reactiva un `IGNORED` e `--ignore` retira un `ACCEPTED`.

Un fallo no detiene el resto, y el comando termina con código 1 si hubo fallos. `--accept-all` no se puede combinar con `--accept` ni `--ignore`.

## Efectos laterales

`organize` puede **mover directorios** de grafos a `technologies/<tech>/<key>`, reescribe rutas en `inspections` y regenera `technology.json`.

## Errores esperables

- `Candidate no longer exists.`
- `Cannot group <key>: both source and destination graph folders exist.`
- `Refusing to relocate a graph outside the managed technology output`
