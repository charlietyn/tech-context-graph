# Feature: Agregado por tecnología

**Propósito:** agrupar repositorios de una tecnología bajo una carpeta común y producir un grafo fusionado.

| Aspecto | Detalle |
|---|---|
| Entradas | Sin comando propio; se invoca al final de `RepositoryUpdateService.run`, y `organize` desde aceptar, clasificar y `project:add` |
| Código | `src/services/technology-graph.service.ts`, `src/services/graph-output-path.ts` |
| Tests | `technology-graph.service.spec.ts`, `graph-publication.spec.ts`, `update-safety.spec.ts` |

## `organize(workspace, technology)`

Mueve la salida de cada miembro a `./tech-graphify-out/technologies/<tech>/<key>`, actualiza `graph_output` y las rutas en `inspections`, y regenera `technology.json`. No hace nada con `unknown`.

Salvaguardas: origen y destino dentro de la raíz gestionada; error si existen ambos; si el destino queda dentro del origen, mueve mediante staging temporal y rechaza carpetas que ya contengan otros miembros.

## `refresh(workspace, technology, signal)`

1. `organize`.
2. Miembros `READY` con `graph.json` en disco; ninguno → `undefined`.
3. `inputSignature` = hash de key + ruta + contenido de cada grafo.
4. Si coincide con `aggregate.json` y el digest de salida es válido → `unchanged`.
5. Un miembro: el "agregado" **es** el grafo del miembro, sin copia.
6. Varios: `graphify merge-graphs <grafos...> --out .aggregate-<uuid>.json` (timeout 30 min).
7. Valida forma y aristas colgantes.
8. `rename` a `graph.json`, luego temporal + `rename` de `aggregate.json`.

## Layout resultante

```text
tech-graphify-out/technologies/<tech>/
  graph.json          agregado (solo con ≥ 2 miembros)
  aggregate.json      inputSignature, graphDigest, graphPath relativo
  technology.json     manifiesto v2.0: miembros, kind, versiones, coreStatus
  <key>/              salida de cada miembro
```

Un fallo de agregado no invalida los grafos de los miembros y **se puede reintentar sin re-extraer**. Se informa aparte como `FAILED` en `report.aggregates`, y provoca código de salida 1.

## Límites conocidos

- El temporal `.aggregate-*.json` no se limpia si falla la validación ([R-09](../technical-debt/risks.md)).
- `technology.json` se escribe sin temporal + `rename`.
- La lógica de aristas colgantes está duplicada ([R-13](../technical-debt/risks.md)).
