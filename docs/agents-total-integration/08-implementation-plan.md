# 08 · Plan de implementación TCG — EPIC → FEATURE → WORK PACKAGE → TASK → SUBTASK

> **DOCUMENTO PRINCIPAL.** Es un plan para fase 3, **NO código implementado**. No editar otros repos aquí. Owner: equipo de `charlietyn/tech-context-graph`. Línea base `main@6df893c24a332130a3e6f3585b21fb015d8f2023` (2026-11-05). Evidencia E-R=lectura remota, E-CI=GitHub Actions, E-D=manual `.agents`, P=propuesto. Todas las rutas nuevas se marcan **PROPUESTA**. Los WPs respetan la matriz REQ y CONTRACT. Los tiempos son complejidad relativa (S/M/L), no estimación de entrega.

## 0. Jerarquía y secuencia segura

| EPIC | FEATURE | WPs incluidos | Gate global |
|---|---|---|---|
| EPIC-TCG-A Contrato de lectura reproducible | F-A1 API CLI read-only | **TCG-WP-01** | schema + exit/status + fixtures producer |
| EPIC-TCG-A Contrato de lectura reproducible | F-A2 Fuentes y versión | **TCG-WP-02, 03** | digest/freshness/version exactos |
| EPIC-TCG-B Seguridad y fiabilidad | F-B1 Frontera inputs/ops | **TCG-WP-04** | 0 side effects no autorizados |
| EPIC-TCG-B Seguridad y fiabilidad | F-B2 Fallos/recovery | **TCG-WP-06** | crash/timeout/fail-closed |
| EPIC-TCG-C Integración contract-first | F-C1 Paridad producer-consumer | **TCG-WP-05, 09** | AG+PCX shared fixtures, no imports internos |
| EPIC-TCG-D Calidad y agentes | F-D1 Plataforma verde | **TCG-WP-07** | Ubuntu y Windows green con Graphify fijado |
| EPIC-TCG-D Calidad y agentes | F-D2 Documentación agente | **TCG-WP-08** | `.agents` consistente y probado |

**Orden sugerido sin cambios simultáneos riesgosos:** WP-07 (baseline rojo) + diseño WP-01/02 en paralelo; luego WP-02→03; WP-04 antes de exponer CLI a PCX; WP-06 de hardening; WP-05 de negociación y WP-09 contract suite; WP-08 transversal al final de cada feature. F0 AG/PCX es **bloqueante global**, pero no bloquea escribir y validar las fixtures producer TCG en aislamiento.

### Catálogo de interfaces y ficheros NUEVOS hipotéticos (no existen hoy)

- **PROPUESTA** `src/models/technology-context-result.ts`: TechnologyQueryRequestV1, TechnologyContextResultV1, typed errors.
- **PROPUESTA** `src/services/technology-query.service.ts`: casos de uso de consulta read-only.
- **PROPUESTA** `src/services/published-graph-resolver.service.ts`: verificación pointer/digest/provenance.
- **PROPUESTA** `src/services/technology-version-selector.service.ts`: constraints y estrategia compat.
- **PROPUESTA** `src/commands/technology-query.commands.ts`: entrada CLI serializada sin ruido.
- **PROPUESTA** `src/services/graphify-query.port.ts`: puerto pequeño (si tests justifican; evitar abstract factory).
- **PROPUESTA** `src/services/query-audit-policy.service.ts`: límite/redaction/retention; alternativa: extender StoreService sin nueva clase.
- **PROPUESTA** `test/fixtures/technology-context/*.json` y suites `test/technology-query*.spec.ts`.

Los nombres son candidatos; el diseño de fase 3 debe evitar crear clases triviales si un seam existente permite menor complejidad. `technology.json` v2 y `tcg-current.json` son archivos en runtime, NO paths de código nuevos.

---

## TCG-WP-01 · Superficie CLI de consulta tipada CONTRACT-002

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-01 — Tecnología query/explain/path por CLI JSON** |
| Objetivo | Hacer invocable desde PCX/AG la consulta existente sin exponer REST/MCP nuevo. |
| Requirement IDs | REQ-003, REQ-008, REQ-036, REQ-039, REQ-043, REQ-084 |
| Estado/Evidencia | `src/services/graphify-cli.service.ts:L277-L301,L386-L390@6df893c24a332130a3e6f3585b21fb015d8f2023` implementa query/explain/path solo como método; `src/ui/console-ui.service.ts:L514-L539` consume; `src/commands/repository-control.commands.ts:L15-L95` no expone query. **E-R**. |
| Target | CLI read-only con `TechnologyContextResult/1`, status/exit codes, stdout JSON puro, error tipado. |
| Existing files to inspect | `src/cli.module.ts`, `src/main.ts`, `src/commands/common-options.ts`, `src/commands/repository-control.commands.ts`, `src/services/graphify-cli.service.ts`, `src/ui/console-ui.service.ts`, `src/services/repository-control.service.ts`, `src/services/process-runner.ts`, `test/repository-inspect.command.spec.ts`. |
| Files to modify (PLAN) | `src/cli.module.ts`, `src/services/graphify-cli.service.ts` (solo extender API/timeout), `README.md`, `docs/en/10-advanced-cli.md`, `docs/es/10-cli-avanzada.md`, `.agents/features/graph-query.md`. |
| New files (PROPUESTA) | `src/commands/technology-query.commands.ts`, `src/services/technology-query.service.ts`, `src/models/technology-context-result.ts`, `test/technology-query.command.spec.ts`, `test/fixtures/technology-context/{ready,stale,missing,failed}.json`. |
| Components/interfaces | `TechnologyQueryService.run(TechnologyQueryRequestV1, WorkspaceRef)`, `GraphifyCliService.query()` adapter; `TechnologyContextResultV1`. |
| Contracts/DTO | CONTRACT-002, CONTRACT-006 (techRefs consumed by PCX), no C3/C6 modifications. Input schema en 05; Output `status`, `graphHash`, `sourceRefs`, `matches`, warnings/error. |
| `.agents` impact | Actualizar solo graph-query, workflows/add-command, README después de tests; **no tocar en etapa 2**. |
| Owner/Consumers | OWNER TCG CLI; Consumers PCX TechnologyKnowledgePort y AG TechContextGraphClient. |
| Priority / Complexity | **P0 / L** (no complejo por el comando, sí por evidencia y versionado). |
| Dependencies / Blockers | Diseño WP-02 version + WP-03 freshness para READY; Graphify output JSON desconocido; PCX consumer no validado. |
| Security | No shell interpolation, root allowlist/accepted, input size/UTF8/JSON limit, stdout sin TUI, nunca `--pull`. |
| Tests | TCG-T01/02/03/04/06/08/09/11; TC-001/003/004; DI smoke; malformed JSON negatives. |
| DoD | npm typecheck/build; `tcg technology:query --json` stdout único JSON schema V1; status 4 tipos; error codes; fixtures versionadas; 0 side effects fuera de query log policy; CLI help & docs EN/ES; code review. |
| Rollback | Revertir solo comando/servicio nuevos y DI; conservar método Graphify y TUI; schema externo v1 debe seguir legible si se desplegó. |

**TASK-01.1 análisis de contratos:** subtask 1 localizar `CommandFactory` y opciones reales; subtask 2 reproducir argumentos Graphify `query|explain|path --graph` en fixture aislada (sin red) y documentar stdout versionado; subtask 3 redactar JSON Schema canonical + fixture ERROR; subtask 4 acordar nombre (`technology:query` vs `repository:query`) con PCX/AG. **No llamar endpoint inexistente.**

**TASK-01.2 implementación futura del puerto:** subtask 1 validar DTO; subtask 2 resolver workspace explícito y selección desde store; subtask 3 invocar Graphify con argumentos array; subtask 4 capturar/cancelar/limitar stdout; subtask 5 serializar un JSON sin logs adicionales ni `console.log` espurio; subtask 6 mapear `exitCode` documentado.

**TASK-01.3 compatibilidad:** subtask 1 no alterar TUI existente; subtask 2 prueba entrada sin graph / versión incorrecta / query path vacía; subtask 3 test desde binario compilado en Windows y Linux, `--workspace` temporal; subtask 4 pruebas producer fixtures.

**Acceptance observable:** valid fixture known graph READY devuelve JSON y sourceRefs reales; no graph → MISSING; stdout sigue siendo parseable con avisos; `--pull` nunca se dispara; `TCG-T02/03` funcionan en Jest CLI y bin.

---

## TCG-WP-02 · Metadatos versionados, publicación y provenance

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-02 — Resolver generación inmutable + versiones** |
| Objetivo | Conectar la versión pedida con un `graph.json` aprobado, un hash y una fuente Git concreta. |
| Requirement IDs | REQ-003, REQ-018, REQ-037, REQ-038, REQ-044, REQ-083 |
| Estado/Evidencia | Publicación `tcg-current.json` tiene `fingerprint/configuration/graphifyVersion/graphDigest/inspectionId` (`graphify-cli.service.ts:L239-L246`); `technology.json` v2 lista `technologyVersion/technologyConstraints` (`technology-graph.service.ts:L228-L246`); agregados v2 por family (`L102-L166`). **E-R**. |
| Target | `PublishedGraphRef` inmutable: approved repo, compatible core, repoCommit/dirtyFingerprint, inspectionId, graph digest, pub date, graphify version, sourceRefs verificables. |
| Existing files to inspect | `src/services/graphify-cli.service.ts`, `src/services/technology-graph.service.ts`, `src/services/repository-fingerprint.service.ts`, `src/services/graph-output-path.ts`, `src/services/repository-control.service.ts`, `src/persistence/repository-store.service.ts`, `src/models/repository-state.ts`, `test/graph-publication.spec.ts`, `test/technology-graph.service.spec.ts`. |
| Files to modify (PLAN) | `src/services/technology-graph.service.ts` solo metadatos compat; `src/services/graphify-cli.service.ts` si debe exponer lectura pointer segura; `src/models/repository-state.ts` si se añaden refs; tests. |
| New files (PROPUESTA) | `src/services/published-graph-resolver.service.ts`, `src/services/technology-version-selector.service.ts`, `test/published-graph-resolver.spec.ts`, `test/technology-version-selector.spec.ts`. |
| Components/interfaces | `resolvePublishedGraph(repository): Promise<PublishedGraphRef>`; `select(technology, constraint): PublishedGraphRef[] | VERSION_MISMATCH`; ref no editable. |
| Contract/DTO | CONTRACT-002/006; `sourceRefs[]`, `graphHash`, `resolvedVersion`, `graphifyVersion`, `repoCommit?`, `sourceFingerprint`, `inspectionAt`. |
| `.agents` impact | `domains/graph-lifecycle.md`, `features/technology-aggregation.md`, `data/filesystem-artifacts.md` posterior. |
| Owner/Consumers | TCG provider; AG selector y PCX context builder consumer. |
| Priority / Complexity | **P0 / L** (integridad de datos y compat de formatos). |
| Dependencies / Blockers | Graphify formato node provenance; reglas exactas semver/major ADR; acceso seguro a repo source. |
| Security | `realpath` + contención output, rechazo symlinks externos/puntero absoluto, digest SHA256 calculado, source provenance no confiable si dirty. |
| Tests | TCG-T04/07/12/13, TC-001, contract fixture version mismatch, crash publication. |
| DoD | Nunca `READY` sin digest correcto; `nestjs@10` no consume core 11; sourceVersion/graphifyVersion separado; fixture AG reproduce selector compatible. |
| Rollback | Mantener compatibilidad lectura `technology.json/aggregate.json` v2; agregar campos opcionales, no editar migraciones; fallback explícito MISSING/STALE, no aggregate viejo. |

**TASK-02.1:** medir selección por family/version actual en `TechnologyGraphService`; comparar con `AG/tech-graph-context.ts:L11-L47`; definir semántica de versión exacta (preferir major pinned para MVP). **TASK-02.2:** parser de `tcg-current.json` y `technology.json` validate schema/discriminants, stable graphDigest; para Git recuperar `HEAD` **sin confundir con fingerprint dirty**. **TASK-02.3:** lookup de nodos/paths provenance solo si Graphify los suministra; si no, `matches=[]` y warning. **TASK-02.4:** pruebas de tamper pointer/hash, miembro duplicado/missing, source dirty, aggregate mixto y compatibility con AG.

---

## TCG-WP-03 · Freshness contract y fallback explícito

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-03 — READY/STALE/MISSING/FAILED reproducibles** |
| Objetivo | Prohibir respuestas aparentemente actuales sobre gráfos que ya no corresponden a source/lock. |
| Requirement IDs | REQ-036, REQ-037, REQ-040, REQ-053, REQ-083 |
| Estado/Evidencia | `repository-control.service.ts:L31-L83` calcula o cachea sourceFingerprint según ruta; `inspection-reconcile.service.ts:L34-L95` recupera RUNNING/FAILED si pointer coincide; `repository-state.ts:L3` define 6 estados. |
| Target | State read model discriminado, chequeo digest y fingerprint acotado, timestamp de freshness, fail closed si error de cálculo. |
| Existing files to inspect | `src/services/repository-control.service.ts`, `src/services/inspection-reconcile.service.ts`, `src/services/repository-fingerprint.service.ts`, `src/models/repository-state.ts`, `src/services/graphify-cli.service.ts`, `test/repository-store.service.spec.ts`. |
| Files to modify (PLAN) | `src/services/repository-control.service.ts` si se extrae método de frescura, DTO y tests; evitar cambiar bulk `repository:list` de forma incompatible. |
| New files (PROPUESTA) | `src/services/technology-freshness.service.ts` **solo si** no basta composición de métodos existentes; `test/technology-freshness.spec.ts`. |
| Components/interfaces | `assess(ref,policy): TechnologyFreshness` con `observedAt`, `sourceFingerprint`, `publishedFingerprint`, `status`, reasons. |
| Contracts/DTO | CONTRACT-002 status y errors; CONTRACT-006 techRefs; PCX decide mandatory/optional. |
| `.agents` impact | `features/freshness-and-reconcile.md`, `domains/graph-lifecycle.md`. |
| Owner/Consumers | TCG producer, PCX policy consumer, AG lookup consumer. |
| Priority / Complexity | **P1 / M**. |
| Dependencies / Blockers | WP-02 selector/pointer, decisión TTL. |
| Security | Si no se puede comprobar fingerprint → FAILED, no READY por ausencia de datos; no inspección/pull implícitos. |
| Tests | TC-002/003/004, TCG-T03/05/06/07/14. |
| DoD | TOCTOU con fuente cambiando responde STALE; sin graph MISSING; sin permiso o error filesystem FAILED; cache TTL nunca transforma stale en READY. |
| Rollback | Deshabilitar cache nueva y mantener cómputo on-demand; no alterar publicaciones. |

**TASK-03.1:** documentar conversiones `NEVER/RUNNING/READY/STALE/FAILED/MISSING` a cuatro estados externos sin pérdida de error code. **TASK-03.2:** implementar verificación before+after query y TTL máximo. **TASK-03.3:** probar cambio de git HEAD, cambios dirty/untracked, `.graphifyignore`, missing source, read access denied y re-publicación; snapshots. **TASK-03.4:** definir matriz fallback en fixtures con PCX y no esconder `STALE`.

---

## TCG-WP-04 · Seguridad, scopes y catálogo humano

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-04 — Seguridad de frontera CLI y sources** |
| Objetivo | Impedir que una query externa ejecute comandos/rutas arbitrarios, cambie fuentes o exponga secretos; preservar revisión humana. |
| Requirement IDs | REQ-014, REQ-038, REQ-043, REQ-085, REQ-086, REQ-087 |
| Estado/Evidencia | `process-runner.ts:L18-L69` usa `spawn(shell:false)`, pero captura stdout sin política de output para query; `repository-store.service.ts:L231-L236` guarda input/output; `.agents/technical-debt/risks.md:L7-L39` documenta re-scan y config inert; `repository-git.service.ts:L102-L107` puede reconciliar divergencias. |
| Target | Solo acciones `query/explain/path`, tech/repo ACCEPTED, límites longitud/output/deadline, workspace realpath, redaction, no pull por query, consentimiento explícito para rewrite Git. |
| Existing files to inspect | `src/services/process-runner.ts`, `src/services/repository-git.service.ts`, `src/services/repository-exclusions.ts`, `src/services/graphify-cli.service.ts`, `src/persistence/repository-store.service.ts`, `src/commands/repository-control.commands.ts`, `src/services/config.service.ts`, `config/tech-context-graph.schema.json`, `test/update-safety.spec.ts`. |
| Files to modify (PLAN) | DTO/CLI validator, `src/services/process-runner.ts` límites, `src/persistence/repository-store.service.ts` policy, `src/services/repository-git.service.ts` flag gate **requiere ADR**, `config/schema` si clave real; documentación warnings. |
| New files (PROPUESTA) | `src/services/query-audit-policy.service.ts` (alternativa integración sin clase), tests adversarios `test/technology-query.security.spec.ts`. |
| Components/interfaces | `QueryInputGuard`, `QueryOutputRedactor`, `ApprovedRepositorySelector` (conceptos), CLI `--json`; branch rewrite opt-in separado. |
| Contracts/DTO | CONTRACT-002 INVALID_INPUT/OUTPUT_TOO_LARGE/NOT_APPROVED; CONTRACT-006 untrusted source. |
| `.agents` impact | `agent-rules/review-agent.md`, `architecture/boundaries.md`, `features/graph-query.md`, `features/pull-and-update.md`. |
| Owner/Consumers | TCG security/maintainers; PCX AG consume resultados, no source permissions. |
| Priority / Complexity | **P0 / L**. |
| Dependencies / Blockers | WP-01/02 DTO; decisión humana de compat para `--pull` actual. |
| Security | `realpath` y roots, no PATH override de LLM, no shell, no env dump, stdout sanitized, rate/size, reject remote FS symlink. |
| Tests | TCG-T08/09/15/16/17; tests re-scan ACCEPTED y collision key; pen-test paths/junction. |
| DoD | injection en graph node no altera permisos; audit metadata-only default; no query modifica repo/graph; dirty Git no reescrito sin opt-in; re-scan preserves ACCEPTED; long output corta/error tipado. |
| Rollback | Flags de consulta deshabilitables; `--pull` mantiene compat bajo safe mode aprobado; backup refs no eliminar. |

**TASK-04.1:** threat model (input CLI, workspace, Graphify output, logs, Git source, Graphify executable); modelar `untrusted data` vs instructions. **TASK-04.2:** implementar validators length, regex ids, graph selection by catalogue, realpath; test Windows junction / Unix symlink. **TASK-04.3:** redaction de logs y output con retention/TTL y cap; migración append-only si hay column nuevas. **TASK-04.4:** reparar `upsertCandidate` respetando ACCEPTED y collisions en transacción controlada (comprobar scope para no ampliar WP excesivamente). **TASK-04.5:** decisión de consentimiento `--pull --allow-rewrite-local-commits` **propuesto**, nunca sorprender al usuario con rebase/replace.

---

## TCG-WP-05 · Paridad de vocabulario AG↔TCG↔PCX

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-05 — Vocabulario de contrato y version selector** |
| Objetivo | Alinear el significado exacto de versions, core, status, graphHash, sourceFingerprint sin importación de librerías internas. |
| Requirement IDs | REQ-008, REQ-031, REQ-036, REQ-044, REQ-053 |
| Estado/Evidencia | AG `src/codegen/tech-graphs/tech-graph-context.ts:L11-L47@17d758` exige versión core y no fallback agregado; AG `tech-graph.types.ts:L37-L95` sidecar metadata 1.0; TCG `technology-graph.service.ts:L228-L246` emite technology.json 2.0. PCX puerto concreto pendiente de localizar. |
| Target | Glosario/fixtures con semántica de `technology`, `versionConstraint`, `resolvedVersion`, `graphRevision`, `graphHash`, statuses, warnings; consumer AG/PCX prueban mismo comportamiento. |
| Existing files to inspect | TCG `technology-graph.service.ts`, `repository-state.ts`, `graphify-cli.service.ts`; **solo lectura** AG `tech-graph-context.ts`, `tech-graph.types.ts`, `tech-graph-registry.ts`, `tech-context-graph.client.ts`; PCX adapter cuando localizado. |
| Files to modify (PLAN) | En TCG: DTO, tests, `docs/en/`, `docs/es/` y `.agents/integrations/integrations.md`. **No modificar AG/PCX en esta rama.** |
| New files (PROPUESTA) | `test/fixtures/contracts/technology-context/v1/*.json`, `docs/en/technology-contract-v1.md`, `docs/es/contrato-tecnologia-v1.md`. |
| Components/interfaces | `TechnologyQueryRequestV1`, `TechnologyContextResultV1`; `TechnologyVersionSelector`. |
| Contracts/DTO | CONTRACT-002/006 y X-03/X-12; **separar** AG metadata v1 de TCG manifest v2 y C6 capabilityHash. |
| `.agents` impact | `integrations/integrations.md`, `data/filesystem-artifacts.md`. |
| Owner/Consumers | TCG contrato producer, AG+PCX consumer con owners independientes. |
| Priority / Complexity | **P1 / M**. |
| Dependencies / Blockers | WP-02, decisiones semver, descubrimiento PCX port, C6 F0 global. |
| Security | Misma terminología no implica mismos permisos; provenance no sirve de auth. |
| Tests | TC-001..004, TCG-T04/13/18; consumer-driven tests AG/PCX por SHA. |
| DoD | Fixtures compartidos, matriz de compat por versiones publicada, consumers validan JSON, unknown schema fallan cerrados; no drift de selector. |
| Rollback | Mantener parsers v1; desactivar nueva flag sin reemplazar sidecar AG. |

**TASK-05.1:** documentar table `technologyVersion` (core), `packageVersion` (librería), `graphifyVersion` (engine), `graphDigest` (bytes), `sourceFingerprint` (estado fuente), `repoCommit` (HEAD) y `capabilityHash` (AG C6) **distintos**. **TASK-05.2:** fixture NestJS major 10/11 con libs 10/ambas; `No core compatible` bloquea. **TASK-05.3:** formalizar mapper TCG manifest v2/AG metadata v1 sin esquema falso. **TASK-05.4:** revisión técnica con owners AG/PCX y plan de migración de consumers.

---

## TCG-WP-06 · Recuperación/fallas Graphify y límites operativos

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-06 — Recovery/timeout/protocol hardening** |
| Objetivo | Evitar pérdida de última publicación válida, acumulación sin límites, hangs y falsos READY después de crash. |
| Requirement IDs | REQ-018, REQ-037, REQ-040, REQ-083, REQ-087, REQ-088 |
| Estado/Evidencia | `graphify-cli.service.ts:L137-L262` pointer+digest+fingerprint; `inspection-reconcile.service.ts:L24-L95` recovery; `process-runner.ts:L18-L69` timeout; `sqlite-database.service.ts:L116-L121` export+rename; `.agents/technical-debt/risks.md:L42-L55,L91-L105`. |
| Target | Error taxonomy estable, cancel propagado, `query` max output, recovery before/after publication, bounded logs/generations, integrity check before READY. |
| Existing files to inspect | `src/services/graphify-cli.service.ts`, `inspection-reconcile.service.ts`, `technology-graph.service.ts`, `process-runner.ts`, `operation-lock.ts`, `src/persistence/sqlite-database.service.ts`, `sqlite-migration.service.ts`, `test/graph-publication.spec.ts`, `test/graph-output-migration.spec.ts`. |
| Files to modify (PLAN) | Extensiones acotadas a servicio de consulta, runner, reconciler y tests; configuraciones solo si tienen consumidor real; nueva migración versionada si persiste metadata. |
| New files (PROPUESTA) | `test/technology-query.recovery.spec.ts`, `test/fixtures/graphify-protocol/v-pinned/`, `src/services/graph-document.ts` **solo si** duplicidad de validadores queda demostrada. |
| Components/interfaces | `GraphifyQueryPort` y typed OperationError; `PublicationValidator` reutilizable. |
| Contract/DTO | CONTRACT-002 errors, provenance y duration; `graphDigest`, `inspectionId`, `sourceFingerprint`. |
| `.agents` impact | `domains/graph-lifecycle.md`, `technical-debt/risks.md`, `testing/strategy.md`. |
| Owner/Consumers | TCG infra/QA; PCX error mapper consumer. |
| Priority / Complexity | **P1 / L**. |
| Dependencies / Blockers | WP-02/03, Graphify version pinned; CI fixtures WP-07. |
| Security | No leer graph path fuera de raíz, Graphify output limitado, crash no borra anterior, no auto-pull por retry. |
| Tests | TCG-T06/07/12/14/19/20, TC-004; fault injection SIGTERM, process exit, missing bins; large graph. |
| DoD | Error `TIMEOUT`, `PROCESS_START` y `EMPTY_GRAPH` coherentes; crash matrix pasa; última publicación válida conservada, límites doc y metadatos no sensibles. |
| Rollback | Conservar generaciones válidas; disable prune; rollback de flags sin DB downgrade destructiva. |

**TASK-06.1:** simular failure stages (antes extract, tras generar graph, tras rename pointer, tras DB mark READY, durante aggregate). **TASK-06.2:** asegurar `InspectionReconcileService` no restaura contenido cuyo digest no coincida; test fail-closed. **TASK-06.3:** `MAX_OUTPUT_BYTES`, `maxDuration`, AbortSignal y kill family, Graphify output version check; distinguir `EMPTY_GRAPH` de failed si se decide nuevo estado. **TASK-06.4:** retention policy configurable no destructiva (dry-run; publicar pointer intacto), logging metadata-only y locks recovery. **TASK-06.5:** performance fixture large graph para documentar memoria/tiempos antes de optimizar.

---

## TCG-WP-07 · CI Windows/Linux reproducible y fijación Graphify

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-07 — Baseline Quality green on two OS** |
| Objetivo | Resolver fallos históricos confirmados por logs y obtener señal de release válida antes de dependencias PCX. |
| Requirement IDs | REQ-007, REQ-008, REQ-013, REQ-041 |
| Estado/Evidencia | `Quality` run **41943945018** SHA `6df893c`: Ubuntu 4/101 tests fallidos (2 suites), Windows 5/101 (3); `quality.yml:L17-L37` instala npm pero no Graphify; `graph-output-migration.spec.ts` invoca binario externo. **E-CI**. |
| Target | Tests unit sin Graphify global, integration con Graphify pinado o stub claramente etiquetado, Windows canonical FS comparisons; workflow PR green, evidence by SHA. |
| Existing files to inspect | `.github/workflows/quality.yml`, `package.json`, `test/graph-output-migration.spec.ts`, `test/workspace-onboarding.service.spec.ts`, `test/update-safety.spec.ts`, `test/repository-git.service.spec.ts`, `scripts/verify-update.cjs`, `test/graphify-cli.service.spec.ts`. |
| Files to modify (PLAN) | Workflow tests/matrix y fixtures; test assertions, no change arbitrario de producto para hacer green. |
| New files (PROPUESTA) | `test/fixtures/fake-graphify/` o scripts versionados, `test/utils/path-assert.ts`, smoke CI aislado. |
| Components/interfaces | `GraphifyRunner` contract, deterministic fixtures, `realpath` filesystem resolver. |
| Contracts/DTO | CONTRACT-002 via test outputs; CI evidence anchored SHA. |
| `.agents` impact | `testing/strategy.md`, `testing/test-map.md`, `operations/build.md`, `technical-debt/risks.md`. |
| Owner/Consumers | TCG QA/CI; AG+PCX dependen del gate. |
| Priority / Complexity | **P0 / M**. |
| Dependencies / Blockers | Confirmar Graphify distribution/install + OS availability; versiones de Node en Actions. |
| Security | No `curl|bash` sin checksum, no credential leakage, test temp workspaces y cleanup. |
| Tests | OPS-001, TCG-T10/11/12/17/19; todos los tests existentes del repo. |
| DoD | Workflow Ubuntu+Windows test+typecheck+build+smoke verde en commit SHA fijo; artifacts CI y logs guardados, sin skips ocultos; Graphify real smoke claramente separado del fake. |
| Rollback | Revertir script fixture si breaks; no silenciar suites con skip ni eliminar tests. |

**TASK-07.1 logs concretos:** E-CI: 3 migración `spawn graphify ENOENT` ambos, workspace label con path Windows en Ubuntu, alias `RUNNER~1` vs `runneradmin` en Windows (2 tests). **TASK-07.2:** separar unit pure del smoke integración Graphify real fijado con install reproducible; elegir mock que simule interfaz real y smoke opcional solo si provisioning viable; no llamar `mock` E2E real. **TASK-07.3:** fixtures paths OS-neutral usando `path.win32`, realpath de FS en Windows para paths concretos y comparación normalizada solo donde identidad lo permite. **TASK-07.4:** `npm ci`, `lint:types`, `test`, `build`, `--help`, CLI JSON tests; no desactivar fallos. **TASK-07.5:** revisar jobs recién ejecutados y asegurar run SHA coincide con commit probado.

---

## TCG-WP-08 · Arquitectura de `.agents` y Graphify skills

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-08 — Coherencia de reglas y guía de agentes** |
| Objetivo | Mantener la `.agents` **existente** alineada con CLI, seguridad, contratos y tests sin duplicar instructions. |
| Requirement IDs | REQ-013, REQ-014, REQ-018, REQ-042, REQ-086 |
| Estado/Evidencia | `.agents/README.md:L3-L13` existe y tiene mapa; `AGENTS.md:L3-L16` puntero; `.agents/agent-rules/navigation.md:L5-L23` Graphify-first con cautela; `.agents/technical-debt/opportunities.md:L46-L50` propone CLI y CI. **E-R/E-D**. |
| Target | Instrucciones navegables, port semantics, provenance/freshness y safety con hash; tests de carga efectiva en harness externo PCX cuando aplique. |
| Existing files to inspect | `.agents/README.md`, `.agents/features/graph-query.md`, `.agents/architecture/boundaries.md`, `.agents/agent-rules/navigation.md`, `.agents/agent-rules/review-agent.md`, `.agents/integrations/integrations.md`, `.agents/testing/*`, `AGENTS.md`, `.gitignore`. |
| Files to modify (PLAN) | Las rutas anteriores tras implementar WPs; evitar reescritura de índice/puntero. |
| New files (PROPUESTA) | `.agents/integrations/technology-context-contract.md` **solo si** encaja con guía; un mini fixture `test/agents-instruction-manifest.spec.ts` opcional. |
| Components/interfaces | Documentation source manifest + `rulesHash` consumidor PCX, no port TCG autónomo. |
| Contract/DTO | CONTRACT-006, DS-003 (PCX/DSH consume), CONTRACT-002 docs. |
| `.agents` impact | **Central**; sin cambios en esta ejecución de docs. |
| Owner/Consumers | TCG maintainers; PCX pack builder; workers DSH. |
| Priority / Complexity | **P1 / M**. |
| Dependencies / Blockers | WP-01..07 estabilizados, harness discovery real no verificado. |
| Security | Las reglas en Markdown no son ACL; distinguir Graphify index de canonical business; no exponer secrets ni local workspace paths. |
| Tests | DS-003 como consumer, TCG-T21/22/23/24, architecture boundaries. |
| DoD | `.agents` sin rutas obsoletas; `AGENTS.md` puntero funcional; fuentes con prioridades verificadas; tests mock de expansión/rulesHash y warning si harness ignora links. |
| Rollback | Restaurar páginas de documentación previas, conservar index y binary contracts. |

**TASK-08.1:** comprobar rutas reales y precedencia por runner (no asumir links). **TASK-08.2:** actualizar `graph-query` y `freshness` cuando exista contrato CLI; ejemplos de error de Graphify. **TASK-08.3:** documentar producer TCG vs `.agents` de AG artifact y Source untrusted; tabla de tools permitidas por perfil. **TASK-08.4:** snapshot hashes reales, missing mandatory doc bloquea pack en PCX; test por consumer DSH F10, no simular aquí. **TASK-08.5:** actualizar la deuda [L]/[V] solo después de reproducir/fijar.

---

## TCG-WP-09 · Fixtures cross-repo y pruebas producer/consumer

| Atributo | Diseño de ejecución posterior |
|---|---|
| ID / título | **TCG-WP-09 — Compatibility certification X-03/X-12** |
| Objetivo | Entregar CONTRACT-002 verificable a PCX/AG sin acoplamiento ni claims de CI falsos. |
| Requirement IDs | REQ-008, REQ-013, REQ-031, REQ-036, REQ-044, REQ-053, REQ-063 |
| Estado/Evidencia | AG `tech-context-graph.client.ts:L50-L145@17d758` client subprocess; `tech-graph-context.ts:L11-L47` version core logic. TCG query no CLI. PCX port path no encontrado con búsqueda de nombre, por tanto **pendiente**, no puede declararse integrado. |
| Target | Fixture pack JSON firmado por SHA de contrato (schemaVersion/hash), consumer tests en repos de sus owners, matrix de versions, piloto false/positive y errores. |
| Existing files to inspect | TCG `src/models`, `src/commands`, `test/*`; AG `src/codegen/tech-graphs/*` solo lectura; PCX adapter por descubrir, `libs/automation/src/app-generation/...` contrato C6 para contexto. |
| Files to modify (PLAN) | En TCG: DTO, fixtures, test CLI producer; documentación. **Los consumers los modifica cada owner en su propio repo posterior.** |
| New files (PROPUESTA) | `test/contracts/technology-context-v1.spec.ts`, `test/fixtures/contracts/technology-context-v1/{ready,stale,missing,failed,version-mismatch,integrity-failed}.json`, `docs/en/integration-pcx-ag.md`. |
| Components/interfaces | `TechnologyContextResultV1` parser; CLI producer `--json`; no imports cruzados. |
| Contract/DTO | CONTRACT-002, CONTRACT-006 y X-03/X-12; referenciar C3/C6/C7/C9, no cambiar sus versiones aquí. |
| `.agents` impact | `integrations/integrations.md`, `testing/test-map.md`. |
| Owner/Consumers | TCG producer; AG/PCX owners consumer, QA independiente. |
| Priority / Complexity | **P0 integration gate / L** (coordinación mayor que código). |
| Dependencies / Blockers | WP-01..05 y CI WP-07 green; PCX F7 delivery y F8 adapter; AG C6 F0 para piloto global. |
| Security | Result untrusted; negative unknown fields/schema, hash tamper, no secret output; ACL externa del PCX runner. |
| Tests | TC-001..004, TCG-T01..T18, CT-001..003 (bloqueante global), DS-003/OPS-001 según fase. |
| DoD | Producer CI verde; consumer fixtures pasan contra commits exactos AG+PCX; semver negotiation publicada; integración controlada `UC-TH-001` con falla TCG optional/required evidenciada. |
| Rollback | Pin al schema anterior compatible; feature flag en PCX para desactivar TCG optional; no pérdida de casos UC. |

**TASK-09.1:** definir JSON fixtures y hash de schema con error variants; local test parse. **TASK-09.2:** entregar contrato a owners PCX/AG mediante PRs separados en sus propios repos (FUERA del permiso de esta etapa); PCX adapter invoca TCG con `--workspace` explícito y timeout. **TASK-09.3:** prueba CI de compat en runner aislado, firmar SHA producer/consumer; evitar tags que no apuntan a SHA verificable. **TASK-09.4:** en piloto KwikVet, solicitar NestJS/versión real del artifact; READY o fallback tipado; recuperar Git/QA por PCX, no reportar integrated desde TCG.

---

## 10. Definition of Done transversal y gates

| Gate | Requisito de cierre | Quién certifica |
|---|---|---|
| G-TCG-0 | Branch writable + review docs del plan; baseline CI identificado; autorización para cambios de código **nueva**, no este prompt | Maintainer |
| G-TCG-1 | Schema CONTRACT-002, ejemplos positivos/negativos, policy/version/timeout, test CLI `--json` | TCG owner + consumers |
| G-TCG-2 | graphDigest/fingerprint/repoCommit/GraphifyVersion y regla de versión core verificadas | TCG reviewer independiente |
| G-TCG-3 | Adversarial paths, prompt injection, no writes, no secrets y consent Git | Security reviewer |
| G-TCG-4 | Ubuntu+Windows CI test/build/smoke verde en SHA de release, sin `skipped` ocultos | QA |
| G-TCG-5 | AG y PCX consumer tests verificados por commits exactos; no C6 drift P0 | Owners AG/PCX y TCG QA |
| G-TCG-6 | ContextPack del piloto contiene TCG refs SHA+hash, pero AC verificadas por PCX/QA | PCX, no TCG |

## 11. Interacciones con otros repos (contratos, no cambios autorizados)

- **PCX** desarrollará `TechnologyKnowledgePort`, adapter CLI JSON, selector mandatory/optional, correlation, retries/timeout y TaskContextPack. No asumir que el puerto ya existe.
- **AG** debe conservar `TechContextGraphClient` y su selector de version; adoptar fixtures CONTRACT-002 cuando evolucione, sin convertir Nuxt en target ni copiar Graphify.
- **UI** solo muestra contexto técnico desde PCX y estado `STALE` explícito. No invoca TCG local ni lee filesystem del workspace.
- **DSH Harness** solo consume task pack PCX con tecnología versionada como fuente *no autoritativa*; no guarda aprobación en TCG.
- **Superagent** queda como inspiración de policy/engine/outbox/observabilidad en PCX, no implementación en TCG.

## 12. Riesgos de ejecución y rollback general

1. **Repo del usuario**: TCG puede usar checkout real como workspace. Jamás ejecutar comandos mutadores sin `--workspace <tmp>`, `TCG_CONFIG_HOME=<tmp>` y source fixture temporal; no `repository:inspect --pull` en debugging.
2. **Source-provenance falsa**: no afirmar código asociado a SHA si repo dirty; reportar `repoCommit` y `sourceFingerprint` separadamente, marcar `DIRTY` cuando corresponda.
3. **Breaking CLI AG**: nuevos comandos no renombrarán los legacy; mantener `project:add` y `repository:inspect` hasta que consumos se migren y prueben.
4. **Graphify externo**: si Graphify no está disponible, no inventar consultas; `GRAPHIFY_UNAVAILABLE`, timeout cancelable y recovery.
5. **Migrations**: append-only, backups previos, mantener `tcg-current.json` y generations; schemaVersion bump si cambia semántica.
6. **Rollbacks multirepo**: cada repo revierte su adapter/feature flag independientemente. Aun con TCG verde, PCX/AG no están certificados por ello.


---
