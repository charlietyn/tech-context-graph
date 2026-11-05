# Feature: Frescura y reconciliación

**Propósito:** que el estado mostrado refleje la realidad del disco sin penalizar el arranque, y recuperarse tras procesos interrumpidos.

| Aspecto | Detalle |
|---|---|
| Entradas | `repository:reconcile [--json]`; automático al abrir la TUI |
| Código | `inspection-reconcile.service.ts`, `RepositoryControlService.list/get/refreshInBackground`, `repository-fingerprint.service.ts` |
| Tests | `graph-publication.spec.ts`, `update-safety.spec.ts` |

## Reconciliación

```text
lock .tcg/update.lock  (impide tratar una ejecución viva como interrumpida)
para la última inspección de cada repositorio, si RUNNING o FAILED:
   ¿publicación con mismo inspectionId, mismo fingerprint y digest correcto,
    grafo legible, > 0 nodos, sin aristas colgantes?
     sí → READY (healed)
     no y RUNNING → FAILED "interrupted" (interrupted)
     no y FAILED → sin cambios
```

**Principio:** nunca se "cura" con un grafo antiguo válido. Hay un test específico para esto.

## Frescura en la TUI

1. El menú se pinta con el **estado almacenado**, sin esperar.
2. En segundo plano: reconcile (una vez por sesión) → `refreshInBackground`.
3. `refreshInBackground`: 2 workers, caché de 30 s en memoria por `workspace:id`, cancelable.
4. Al elegir una opción del menú, se aborta y espera el trabajo en segundo plano.
5. El resumen muestra "Freshness checked: n/total" y errores por separado.

Tras una actualización, `invalidate(root)` limpia la caché.

## Lectura

| Método | Fingerprint | Coste |
|---|---|---|
| `store.list` | No | Bajo |
| `RepositoryControlService.list` | De caché; comprueba si existe la fuente | Bajo |
| `RepositoryControlService.get` | **En vivo** | Puede ser alto |

## Registro de arranque

`.tcg/logs/startup.jsonl` guarda el tiempo hasta el primer menú. Sirve para vigilar regresiones de rendimiento.
