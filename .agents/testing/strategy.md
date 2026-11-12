# Estrategia de testing

## Niveles

| Nivel | Herramienta | Qué usa de verdad | Cuándo |
|---|---|---|---|
| Tipos | `npm run lint:types` | `tsc --noEmit`, incluye `test/` | Siempre |
| Unitario e integración | `npm test` | Jest + ts-jest, en serie (`--runInBand`). SQLite real, sistema de ficheros real, **Git real** en 2 suites, y el **binario `graphify` real** para `graphify --help` en `graph-output-migration.spec.ts` | Siempre |
| Smoke compilado | `node dist/main.js --help` | Binario y DI | Tras build |
| Extremo a extremo real | `node scripts/verify-update.cjs` | Graphify real + Git en temporales | Al tocar el contrato con Graphify o el coordinador |

CI (`.github/workflows/quality.yml`) ejecuta los tres primeros en Ubuntu y Windows con Node 20, sin instalar Graphify. Termina en `--help`, así que **no ejecuta ningún comando**. El script real no corre en CI.

**CI está en rojo en `main` desde `cb11311`.** Una de las causas: `graph-output-migration.spec.ts` falla con `spawn graphify ENOENT` porque CI no tiene el binario.

## Línea base del snapshot

18 suites, 101 tests, entre 47 y 89 s en Windows. `verify-update.cjs` no se ejecutó en este análisis porque requiere `npm run build`, que borra `dist/`.

## Patrones en uso

- **Fixture temporal:** `mkdtempSync(resolve(tmpdir(), 'tcg-...'))`. Nunca rutas reales.
- **Instanciación directa:** `new Service(mockColaborador as never)`, sin `Test.createTestingModule`.
- **Reales cuando se puede:** `new SqliteDatabaseService()` con un fichero real. Cierra siempre con `sqlite.close()` en `finally`, o el lock queda tomado.
- **Graphify simulado:** `jest.spyOn(graphify as any, 'spawnGraphify')` escribe un `graph.json` falso; también `helpCache` y `version`. Ver `test/graph-publication.spec.ts`.
- **Graphify real en una suite:** `test/graph-output-migration.spec.ts` simula `spawnGraphify`, `captureGraphify` y `version`, pero no `helpCache`, así que `inspectLocked` ejecuta el `graphify --help` real.
- **Git real:** clones `seed` → `origin.git` → `clone`. Ver `fixture()` en `test/update-safety.spec.ts`.
- **Aislamiento de entorno:** `TCG_KIT_ROOT` para encontrar `config/`; `TCG_CONFIG_HOME` para el registro. **Restáuralos** al terminar.
- **Clack simulado:** mocks de prompts con respuestas en cola. Ver `test/workspace-onboarding.service.spec.ts`.

## Huecos reales

| Hueco | Consecuencia |
|---|---|
| **Casi nada pasa por commander:** los tests llaman a `command.run()`, salvo `--no-cluster` en `repository-inspect.command.spec.ts` | Errores de flags invisibles en los demás comandos |
| Nada ejecuta el binario con DI en CI | Cubierto solo por `--help` |
| Re-escaneo de repositorios aceptados | [R-02](../technical-debt/risks.md) y [R-03](../technical-debt/risks.md) |
| `RepositoryRootService`, `DoctorCommand`, comandos `project:*` | Sin cobertura directa |
| `GraphifyCliService.query` | Solo se comprueban los argumentos, en `graph-output-migration.spec.ts`, con `captureGraphify` simulado |
| `ConsoleUiService` | Solo el flujo de pull en lote |

## ARGEns v6 contract quality gates (rama agents-total-integration)

Pruebas de resolución por SHA-256/fingerprint/pointer, selección exacta de core, `sourceRefs`, JSON Schema y fixtures STATUS. CI Ubuntu+Windows con Graphify **simulado exclusivamente en unit tests**; el E2E de Graphify real requiere provisioning independiente y comprobación de versiones. `test/technology-query.service.spec.ts`, `test/published-graph-resolver.spec.ts`, `test/technology-contract.schema.spec.ts` y `test/repository-catalog-invariants.spec.ts`. El test no demuestra integración en PCX/AG ni equivalencia con un modelo LLM.

## Certificación real de Graphify (Linux)

`scripts/smoke-graphify-real.cjs` (workflow manual `.github/workflows/graphify-real-integration.yml`, pin `graphifyy==0.9.105`) usa el **CLI compilado** con Graphify real sobre fuentes Git temporales con commits deterministas: nestjs 10+11 sin mezcla, query/explain/path READY, MISSING/STALE/FAILED con su código de salida, C1 (sin commit, sucio), Graphify ausente, y valida cada salida con Ajv. Exporta las salidas reales a `ci-evidence/contract-fixtures/` (ignorado por Git). `scripts/build-technology-graphs.cjs` construye y certifica los cores reales de C6 (clones fijados por commit). Evidencia local por SHA en `docs/agents-total-integration/evidence/local/tcg/`. `scripts/smoke-crash-recovery.cjs` mata el CLI real con SIGKILL en cada paso de la publicación del puntero (hook solo de pruebas `scripts/test-hooks/crash-at.cjs`, cargado con `node -r`); `test/published-graph-containment.spec.ts` cubre enlaces simbólicos y junctions fuera del workspace (los casos de enlace a fichero se omiten donde el SO no permite crearlos). Windows nativo: copia en ruta con espacios accedida por junction, mismas puertas (TCG-05). No sustituye Windows ni el consumo real en PCX/DBIG.
