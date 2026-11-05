# Módulo: Console UI

**Ficheros:** `src/ui/console-ui.service.ts` (552 líneas), `src/ui/repository-ui-presenter.service.ts`, `src/ui/clack-prompt.service.ts`.

Ver flujos en [cli/interactive-ui.md](../cli/interactive-ui.md).

| Clase | Responsabilidad | Regla |
|---|---|---|
| `ConsoleUiService` | Menú principal y flujos | Debe delegar la lógica de dominio |
| `RepositoryUiPresenterService` | Tablas, etiquetas, símbolos, filtros | Puro, sin E/S; fácil de testear; también lo usa `repository:inspect` |
| `ClackPromptService` | Carga Clack y gestiona la cancelación | Único punto de importación de Clack |

## Por qué el import dinámico

`@clack/prompts` es solo ESM y el proyecto es CommonJS. TS convertiría `import()` en `require()`, así que `dynamicImport` usa `new Function(...)` para conservarlo. **No lo "simplifiques".** Los tests lo sustituyen con mocks.

## Cancelación

`requireValue(valor)` detecta el símbolo de cancelación y lanza `Error('TCG_CANCELLED')`, que propagan todos los flujos. `ConsoleUiService.run` y `main.ts` lo capturan. Es una **cadena centinela**, no una clase; no cambies el mensaje.

## Concurrencia con trabajo en segundo plano

Antes de ejecutar cualquier acción, `run` aborta y espera el trabajo de frescura. Regla: **el trabajo en segundo plano nunca imprime en prompts activos**; los errores van a `backgroundNotice` y se muestran en el siguiente resumen.

## Deuda

- `storePath()` devuelve `.tcg/state.sqlite` fijo, ignorando `persistence.file` ([R-07](../technical-debt/risks.md)). Usa `SqliteDatabaseService.getPath` si tocas esto.
- Hay `?` literales en mensajes donde debería haber un separador ([R-14](../technical-debt/risks.md)).
- La UI está solo en inglés; `ui.language` no se lee.
- Cobertura: solo `console-ui-batch-pull.spec.ts`.
