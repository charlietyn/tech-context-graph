# Estrategia de testing

## Niveles

| Nivel | Herramienta | Qué usa de verdad | Cuándo |
|---|---|---|---|
| Tipos | `npm run lint:types` | `tsc --noEmit`, incluye `test/` | Siempre |
| Unitario e integración | `npm test` | Jest + ts-jest, en serie (`--runInBand`). SQLite real, sistema de ficheros real, **Git real** en 2 suites | Siempre |
| Smoke compilado | `node dist/main.js --help` | Binario y DI | Tras build |
| Extremo a extremo real | `node scripts/verify-update.cjs` | Graphify real + Git en temporales | Al tocar el contrato con Graphify o el coordinador |

CI (`.github/workflows/quality.yml`) ejecuta los tres primeros en Ubuntu y Windows con Node 20, sin Graphify. Termina en `--help`, así que **no ejecuta ningún comando**. El script real no corre en CI.

## Línea base del snapshot

18 suites, 98 tests (101 con el trabajo aún sin publicar), entre 47 y 89 s en Windows. `verify-update.cjs` no se ejecutó en este análisis porque requiere `npm run build`, que borra `dist/`.

## Patrones en uso

- **Fixture temporal:** `mkdtempSync(resolve(tmpdir(), 'tcg-...'))`. Nunca rutas reales.
- **Instanciación directa:** `new Service(mockColaborador as never)`, sin `Test.createTestingModule`.
- **Reales cuando se puede:** `new SqliteDatabaseService()` con un fichero real. Cierra siempre con `sqlite.close()` en `finally`, o el lock queda tomado.
- **Graphify simulado:** `jest.spyOn(graphify as any, 'spawnGraphify')` escribe un `graph.json` falso; también `helpCache` y `version`. Ver `test/graph-publication.spec.ts`.
- **Git real:** clones `seed` → `origin.git` → `clone`. Ver `fixture()` en `test/update-safety.spec.ts`.
- **Aislamiento de entorno:** `TCG_KIT_ROOT` para encontrar `config/`; `TCG_CONFIG_HOME` para el registro. **Restáuralos** al terminar.
- **Clack simulado:** mocks de prompts con respuestas en cola. Ver `test/workspace-onboarding.service.spec.ts`.

## Huecos reales

| Hueco | Consecuencia |
|---|---|
| **Casi nada pasa por commander:** los tests llaman a `command.run()`, salvo `--no-cluster` en `repository-inspect.command.spec.ts` | Errores de flags invisibles en los demás comandos |
| Nada ejecuta el binario con DI en CI | Cubierto solo por `--help` |
| Re-escaneo de repositorios aceptados | [R-02](../technical-debt/risks.md) y [R-03](../technical-debt/risks.md) |
| `GraphifyCliService.query`, `RepositoryRootService`, `DoctorCommand`, comandos `project:*` | Sin cobertura directa |
| `ConsoleUiService` | Solo el flujo de pull en lote |
