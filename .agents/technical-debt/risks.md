# Riesgos

**Evidencia:** **[V]** reproducido ejecutando código en un workspace temporal aislado el 2026-11-05. **[L]** confirmado leyendo el código, sin ejecutar. Elimina una entrada al corregirla.

## Alta

### R-02. Un re-escaneo sobrescribe la clasificación manual y la key de un aceptado [V]

`upsertCandidate` actualiza `repo_key`, `technology`, `category`, `ignore_profile`, etc., sin mirar `catalog_status`. Reproducido: tras `updateClassification` a `manualtech`, un re-escaneo dejó `technology=nestjs` y `key=renamed`, con `graph_output` aún en `technologies/nestjs/api`.

- **Dónde:** `src/persistence/repository-store.service.ts`, `upsertCandidate`.
- **Impacto:** se pierde `repository:classify`, cambia la key que usan los scripts del usuario, y `graph_output` queda desalineado hasta el siguiente `organize`.
- **Solución:** en filas `ACCEPTED` conservar identidad y clasificación, como ya se hace con `source_path`. Actualizar solo `last_seen_at` y evidencia.

### R-03. Una key repetida entre escaneos aborta todo el guardado [V]

`ensureUniqueKeys` solo mira un informe. `ON CONFLICT(path)` no cubre `repo_key` único. Reproducido: `UNIQUE constraint failed: repositories.repo_key`.

- **Dónde:** `saveDiscovery`, `ensureUniqueKeys`.
- **Impacto:** escanear otra raíz con un proyecto llamado igual falla y descarta **todos** los candidatos de esa pasada, aunque el informe de `context-pack/` ya se escribió.
- **Solución:** resolver contra las keys existentes de otra ruta antes de insertar.

## Media

### R-07. Claves de configuración sin efecto [L, con búsqueda]

Se validan pero **ningún código las lee**: `ui.*`, `graphify.code_only`, `graphify.force_rebuild`, `graphify.query_log_disabled`, `graphify.semantic.*`, `security.*`, `workspace.paths.{logs,graphs,reports}`, `persistence.driver`, `persistence.artifact_storage`.

Casos engañosos:

- `graphify.executable` solo lo usa `doctor`: **puede dar OK sobre un binario que la inspección no usa**.
- `query_log_disabled: true` no impide guardar consultas.
- `security.*` da una falsa sensación de control. La seguridad real es que `--code-only` está fijo.
- `ConsoleUiService.storePath` muestra una ruta fija aunque `persistence.file` sea otra.

### R-08. El escáner ignora `repository_discovery` del YAML [L]

`discover` usa `catalog.settings`. Valores por defecto contradictorios: profundidad 8 en catálogo, 7 en YAML y `RepositoryRootService`. El aviso de truncado sugiere subir `maximum_directories`, pero hay que hacerlo en el catálogo.

`project:refresh` pasa `config.repository_discovery?.min_confidence`, que no existe, e **ignora el `min_confidence` de cada raíz**.

### R-09. Crecimiento sin límite [L]

- `.generations/` se conserva completo, incluidas ejecuciones fallidas. Documentado como "sin política de retención".
- `.tcg/logs/`.
- `graph_queries.output_text` crece y se reexporta en cada escritura, sin lector.
- `.aggregate-*.json` queda si falla la validación.

### R-10. Persistencia por exportación completa [L]

Cada `run` exporta toda la BD, sin fsync. El coste crece con el historial (ver R-09). Lo mitigan las transacciones y que `rename` sea atómico; un corte puede perder la última escritura.

### R-11. Timeout fijo de 120 s para `git pull` [L]

`RepositoryUpdateService` no pasa `timeoutMs`. Repositorios grandes con red lenta darán `TIMEOUT` sin forma de ajustarlo. Está documentado, pero no es configurable.

### R-13. Lógica duplicada [L]

| Lógica | Copias |
|---|---|
| Resolución de workspace y ruta del registro | `common-options.ts`, `WorkspaceResolverService`, `GlobalWorkspaceRegistryService` |
| Extremos y aristas colgantes | `graphCounts`, `removeDanglingEdges`, `TechnologyGraphService.refresh`, con formatos aceptados distintos |
| Localizar `graph.json` | `resolveGraphPath`, `RepositoryControlService.graphPath`, `mapRow`, `writeTechnologyManifest`; **solo el primero usa el puntero** |

Una corrección en un sitio deja los demás mal.

### R-15. Dos almacenes sin transacción común [L]

`project:list` lee YAML y `repository:list` lee SQLite, con resultados distintos. `repository:scan` añade raíces solo a SQLite. La sincronización de raíces es unidireccional y solo al listar. `RepositoryRootService.add` escribe primero en SQLite: si el YAML falla, quedan distintos.

### R-16. Inconsistencias de flags [L]

- `project:discover`, `project:review`, `project:prepare` y `project:refresh` no aceptan `--workspace`, pese a que `docs/en/10-advanced-cli.md` lo recomienda.
- `project:add --kind` anuncia `core`, `library`, `application`, pero solo `auto` tiene efecto.
- `--max-depth`, `--confidence` no validan; aceptan `NaN`.
- En modo TUI se ignora `TCG_WORKSPACE`.

## Baja

### R-12. Avisos compartidos entre miembros de un monorepo [L]

`row.notices` reutiliza la referencia a `pull.result.notices` y se le hace `push`. Los avisos de una fila se filtran a las siguientes de la misma raíz. **Solución:** copiar el array.

### R-14. Textos incorrectos [L]

- `tcg graph:code` no existe; aparece en `project:refresh` y `REPOSITORY_DISCOVERY.md`.
- `?` literal en `console-ui.service.ts` (`runUpdates`, `showUpdateReport`) y `docs/en/15-git-pull-before-inspection.md`, probablemente separadores mal codificados. En `docs/es/15-git-pull-antes-inspeccion.md` también sustituye a las tildes.
- "Registrados" en español dentro del informe en inglés.
- El resumen de onboarding muestra `\` en todas las plataformas.

### R-17. `EMPTY_GRAPH` deja una inspección `FAILED` [L]

El coordinador lo trata como `ok`/`SKIPPED`, pero `inspectLocked` ya marcó `FAILED`. Un repositorio de solo documentación se ve siempre fallido en el resumen y se reintenta en cada lote.

### R-18. Locks que requieren intervención [L]

Si un PID muerto se reutiliza, el lock parece vivo. Un `.recovery` huérfano por crash bloquea hasta borrarlo. No hay comando para ello.

### R-19. Grafos grandes en memoria y síncronos [L]

`readFileSync` + `JSON.parse` se aplican varias veces por grafo, bloquean el event loop y están sujetos al límite de cadena de V8. Afectaría primero a los agregados más grandes.

### R-20. Sin versión mínima de Graphify, parsing frágil [L]

El contrato de salida se apoya en regex y detección por `--help`. Un cambio de formato degrada en silencio el progreso y las comunidades. `verify-update.cjs` lo detectaría, pero no corre en CI.

### Código sin uso [L]

`WorkspaceConfigService.configureStart`, `WorkspaceResolverService.requirePath`, opción `allowLastShortcut`, `describeRepositoryPull`, `invalidateVersion`, tabla `settings`, estados `REJECTED` y `MISSING` de catálogo.

## Seguimiento de riesgos en `agents-total-integration` (no borrar evidencias originales)

Mitigaciones incluidas en esta rama: rescan no sobrescribe clasificación `ACCEPTED`; claves nuevas colisionadas adquieren sufijo determinista; query CLI sin persistencia de prompts; TUI almacena queries solo por opt-in explícito; lectura versionada de Graphify verifica publicación, integridad, commit/fingerprint y SQLite; pruebas unit no requieren binario Graphify. Riesgos aún por certificar: E2E de Graphify real, integración de fixtures con consumidores PCX/AG, límites de ejecución/sandbox multi-tenant fuera del repositorio, limpieza configurable de generaciones/logs y políticas de consentimiento Git divergente. Cada mitigación se debe corroborar con GitHub Actions en SHA concreto.

### R-21. Lecturas de contrato bloqueadas durante inspecciones [M] (2026-11-11)

`SqliteDatabaseService.open` toma el lock del workspace durante toda la vida del proceso. Un `technology:query`/`technology:reference` lanzado mientras otro proceso inspecciona falla con `QUERY_FAILED` `retryable: true` (antes `retryable: false`). Mitigación pendiente: lectura de un snapshot inmutable del catálogo sin lock exclusivo. Los consumidores (PCX) deben reintentar con backoff o tratarlo como DEGRADED/BLOCKED según su política.

### R-22. Nombres ambiguos en Graphify [L] (2026-11-11)

Graphify 0.9.105 sale con código 3 cuando un nombre coincide con varios nodos (p. ej. `SpringApplication`: clase y constructor) y pide el id completo. TCG lo devuelve como `FAILED/QUERY_FAILED` sin contenido (fail-closed); el consumidor debe repetir con el id del nodo. No se parsea la desambiguación.

### R-23. Recuperación de locks por PID [L] (2026-11-11)

`acquireLockSync` recupera el lock de un dueño muerto con `process.kill(pid, 0)`. Si el SO reutiliza ese PID para otro proceso, el lock se considera vivo y la operación devuelve `LOCKED` hasta borrar el fichero a mano. Comprobado en TCG-14: tras SIGKILL real, Linux y Windows recuperan los locks sin residuos.
