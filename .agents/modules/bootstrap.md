# Módulo: Bootstrap y DI

**Ficheros:** `src/main.ts`, `src/cli.module.ts`, `src/configuration.module.ts`, `src/persistence.module.ts`.

## Módulos Nest

| Módulo | Exporta | Importa |
|---|---|---|
| `ConfigurationModule` | `WorkspaceConfigValidationService`, `WorkspaceConfigService` | — |
| `PersistenceModule` | `WorkspaceDatabasePathService`, `SqliteDatabaseService`, `RepositoryStoreService` | `ConfigurationModule` |
| `CliModule` | — | Ambos; provee **todo lo demás** |

`SqliteMigrationService` es interno a `PersistenceModule`.

## Dependencias críticas de compilación

Nest resuelve constructores usando `design:paramtypes`, emitido por `tsc` y `ts-jest` con `emitDecoratorMetadata: true`.

**tsx (esbuild) no emite esa metadata:** los constructores reciben `undefined` y el error es `Cannot read properties of undefined (reading 'load')`. Por eso `npm run dev` compila con `tsc` en lugar de usar tsx.

`import 'reflect-metadata'` debe ser la **primera** importación efectiva de `main.ts`.

## Códigos de salida

| Código | Significado | Origen |
|---|---|---|
| 0 | Éxito o cancelación (`TCG_CANCELLED`) | `main.ts` |
| 1 | Fallo parcial | `process.exitCode = 1` en `repository:inspect`, `repository:review --accept-all`, `doctor` |
| 2 | Error no controlado | `serviceErrorHandler` y `catch` en `main.ts` |

## Detalles

- `logger: ['error']` silencia a Nest; stdout queda para los comandos y `--json`.
- `onModuleDestroy` de `SqliteDatabaseService` persiste y libera el lock. El bucle TUI cierra la aplicación en `finally`.
- `workspaceFromArgs` en `main.ts` es un parser manual de flags, solo para modo TUI.
- `tcg ui` con TTY no llega a `UiCommand`: lo intercepta `main.ts`. `UiCommand` solo actúa sin TTY.
