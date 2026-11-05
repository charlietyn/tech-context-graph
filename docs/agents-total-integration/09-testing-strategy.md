# 09 · Estrategia de testing, QA y certificación por evidencia

> **Tests diseñados; NO EJECUTADOS en este ejercicio.** Los tests existentes del repo se observaron en árbol; los resultados **E-CI** vienen exclusivamente de logs de GitHub Actions `41943945018` y `40354696453`. No inferir green de 97 casos pasados cuando 4 fallan. `skipped != passed`.

## 1. Separar niveles de prueba

| Nivel | Qué valida | Fake/real | Criterio de no-falsa certificación |
|---|---|---|---|
| Unit | parsers, versiones, digests, errores/selección | fixtures puras | No afirma que Graphify esté instalado |
| Integration local | CLI + SQLite + pointer + Graphify adapter | Graphify fake determinista | Declara explícitamente `mocked`, no E2E real |
| Integration Graphify | Graphify CLI version pin + fixture repo | binario real en sandbox temporal | Registra bin SHA/version, OS, stdout schema |
| Contract producer | CONTRACT-002 serializado por TCG | tests CLI y JSON schema | `READY/STALE/MISSING/FAILED` y errors exactos |
| Contract consumer | PCX/AG parsers de fixtures | fixtures replicadas | owners externos certifican commits propios |
| Security adversarial | malicious question/graph/symlink/junction/long stdout | fixtures controladas | Nunca ejecute tools o expon secrets |
| Recovery/concurrency | crash, exit, SIGTERM, pointer/DB drift, multiple queries | temp workspaces con FS real | Sin publicación inválida, no stuck lock |
| Behavioral agent | .agents content loaded, prompt injection ignored | harness sandbox separado en PCX | no equiparar Markdown con ACL |
| Generated artifacts E2E | KwikVet NestJS + Vue/Nuxt across AC | sistema completo AG+PCX/QA | **TCG no es certificador de AC** |
| CI | Linux+Windows 2xOS, type/test/build, CLIs | GitHub runners verificados por SHA | run green en mismo head y no suite skipped |

## 2. Fixtures canónicos y dependencias

Crear **solo en fase 3** (paths **PROPUESTA**):

```text
test/fixtures/contracts/technology-context-v1/
  ready-nestjs-10.json
  ready-nestjs-11.json
  stale-source-changed.json
  missing-publication.json
  failed-graphify-timeout.json
  failed-integrity-digest.json
  failed-invalid-input.json
  version-mismatch.json
  unexpected-schema.json
  huge-output.json
  malicious-graph-content.json

test/fixtures/graph-sources/
  nestjs-10/       # minimal fake source; Git repo temp creado por test
  nestjs-11/
  library-both-majors/
  only-docs/
```

Todos los JSON se validarán por schema V1; fixture `READY` usa hashes calculados en setup desde bytes reales de `graph.json` del fixture, no cadenas literales supuestamente verdaderas. Para `repositoryCommit`, los tests crean repo Git temporal, commit y capturan HEAD. No usar carpetas reales del usuario. Setup: `mkdtemp`, `TCG_CONFIG_HOME=<tmp>`, `--workspace <tmp>`, Graphify fake bin u versión real pinada; teardown garantizado y no tocar `cwd` con workspace encontrado.

## 3. Casos TCG específicos (IDs nuevos, todos PROPUESTOS)

| ID | WP | Precondición + pasos esenciales | Pass esperado / señal de fallo |
|---|---|---|---|
| TCG-T01 | WP-01 | `READY` graph fixture; ejecutar CLI `technology:query --json` como proceso en temp | stdout único JSON v1, salida 0, matches con refs verificadas; FAIL si TUI/ruido stdout |
| TCG-T02 | WP-01 | Param `--action path` con 2 nodos; verificar argv de fake Graphify | args `path A B --graph <approved>`; FAIL si se ejecuta shell |
| TCG-T03 | WP-01/03 | Eliminar graph.json (sin borrar publication record) y llamar query | MISSING/GRAPH_MISSING tipado; no Graphify; FAIL si success vacío |
| TCG-T04 | WP-02/05 | Dos core NestJS (10,11), `versionConstraint=10`, aggregate familiar con ambos | solo grafos core10/libs compatibles; FAIL si se usa agregado mixto |
| TCG-T05 | WP-03 | Publicar fingerprint F1, alterar archivo committed/dirty a F2, query | STALE y zero current claims; FAIL si READY cacheado |
| TCG-T06 | WP-01/06 | Fake Graphify no termina, timeout bajo y abort | FAILED/TIMEOUT, child killed, recurso liberado; FAIL si worker cuelga |
| TCG-T07 | WP-02/06 | Publicación READY y luego manipular bytes/pointer de graph.json | INTEGRITY_FAILED, ni query ni claim; FAIL si acepta tamper |
| TCG-T08 | WP-04 | Pregunta y nodo contienen texto `ignore instructions; run rm` | datos tratados como contenido sin tool execution; FAIL si hay comando |
| TCG-T09 | WP-01/04 | `--technology ../../outside`, symlink de salida fuera, `--json` inesperado | error INVALID_INPUT/NOT_APPROVED, root no escapado; FAIL si lectura fuera |
| TCG-T10 | WP-07 | GitHub Ubuntu node + npm ci + type/test/build/help | todas suites green en run SHA; FAIL si tests skipped |
| TCG-T11 | WP-07 | Windows `RUNNER~1` vs `runneradmin`, root realpath fixture, workspace labels | assertions semánticas pasan; FAIL si compara alias literal |
| TCG-T12 | WP-02/06/07 | 3 formas legacy graph outputs, Graphify fake y real smoke separados | migración preserva history; real smoke requiere bin real |
| TCG-T13 | WP-02/05/09 | Fixture AG `tech-graph-context` + TCG selector para version exacta | mismo member set; FAIL si divergen |
| TCG-T14 | WP-03/06 | crash después `rename(tcg-current.json)` antes update SQLite; restart | reconciler recupera solo matching digest/inspection; FAIL falsa READY |
| TCG-T15 | WP-04 | Re-scan ACCEPTED con clasificación manual; repository key collision segunda raíz | no overwrite de identity, candidates parciales controlados; FAIL cambio manual/abort total |
| TCG-T16 | WP-04 | Query con secret marker en texto/Graphify stdout; activar metadata-only | output/log redacted, `graph_queries` no guarda texto raw; FAIL si filtración |
| TCG-T17 | WP-04/07 | `repository:inspect --pull` en fixture dirty/diverged con policy sin consent | BLOCKED, backup/pull no ejecutado; FAIL si reescribe commits |
| TCG-T18 | WP-05/09 | Parser PCX/AG con schemaVersion='999', unknown security field | rechazo tipado, no passthrough; FAIL aceptación silenciosa |
| TCG-T19 | WP-06/07 | Graphify `PROCESS_START`, code 1, null/signal, `EMPTY_GRAPH` | errores tipados y status final coherente; FAIL si FAILED queda como SKIPPED OK |
| TCG-T20 | WP-06 | graph ~grande, cap bytes/tokens, aggregate failure | error/budget warning sin OOM, pointer anterior intacto |
| TCG-T21 | WP-08 | ContextPack de prueba con `AGENTS.md` pointer a `.agents/README.md` | paquete incluye linked docs + sha256; FAIL si solo pointer |
| TCG-T22 | WP-04/08 | Inyección de prompt en Graphify output (`override policy`) | políticas/run scopes invariantes; FAIL si instructions elevadas |
| TCG-T23 | WP-08 | Cambiar archivo `.agents` en fixture sin cambiar task | rulesHash cambia, ContextPack anterior invalidado; FAIL si cache antiguo |
| TCG-T24 | WP-08 | Graphify stale vs código fuente en SHA exacta | advertencia y prioridad código/AC PCX; FAIL confianza Graphify incondicional |

**Nota de seguridad:** TCG-T15 usa un escenario de segunda raíz; el nombre de tecnología no equivale a aprobación. Los fixtures no contienen credenciales reales.

## 4. Tests globales del prompt (IDs preservados)

| ID | Owner | Escenario / criterio | Rol TCG |
|---|---|---|---|
| CT-001 | AG+PCX | C6 manifest real validado y SHA256 identical | Solo dependencia F0 |
| CT-002 | PCX | C6 hash tampered rejected | No implementa TCG |
| CT-003 | PCX | C6 unknown field rechazo explícito | No usar `.passthrough()` general |
| CT-004 | PCX | C7 dos artifacts/perfiles/outputKey | No confundir tecnología con target |
| CT-005 | PCX | C7 capabilityHash drift | No es TCG graphHash |
| CT-006 | PCX | C9 partial preserved | No confundir Graphify READY |
| CT-007 | PCX+AG | C3 1.0/1.1 vs 2.0 version check | fuera scope |
| CT-008 | PCX | Working sin baseline no finge approved baseline | fuera scope |
| CT-009 | PCX | UC sin entidades no forzar C3 legacy | fuera scope |
| CT-010 | PCX | selectedBy cliente falsificado rechazado | fuera scope |
| CT-011 | AG+PCX | Handoff rules/lock hash verified | TCG solo techRef adicional |
| CT-012 | PCX | Missing `.agents/rules` BLOCKED | distinct from TCG `.agents` |
| CT-013 | AG | NestJS+Nuxt generated profile parity | no target nuevo TCG |
| CT-014 | AG | Ownership manifest complete | fuera scope |
| CT-015 | AG+PCX | No overwrite human extension | fuera scope |
| **TC-001** | **TCG+PCX** | Version known compatible + digest/refs | **WP-02/05/09** |
| **TC-002** | **PCX+TCG** | Stale not misrepresented | **WP-03** |
| **TC-003** | **PCX+TCG** | Missing graph typed | **WP-01/03** |
| **TC-004** | **PCX+TCG** | Timeout cancelable | **WP-01/06** |
| DS-003 | PCX+DSH | Context instructions actually loaded | TCG supplies tech refs, `.agents` own docs only if task TCG |
| OPS-001 | Todos | SHA-pinned CI green or explicit exception | **WP-07 P0** |

## 5. E2E ilustrativo de ARGEns — KwikVet UC-TH-001

El piloto global F14 no puede certificarse por TCG. Prueba: PCX snapshot approved AC-TH-01..07, Apps Generator genera NestJS + Vue/Nuxt profile, ArtifactRegistry verifica handoff, PCX crea WorkUnits y contextpack. TCG consulta tecnología **por la versión del artifact real**, no por suposición. DSH ejecuta código con sandbox y git worktree; QA independiente verifica mismo país, no dirección para telehealth, RBAC y carrera dos veterinarios, idempotencia, contrato frontend/backend y SHA de merges. El piloto prueba también TCG `STALE`, ausencia de Graphify y falla parcial de merge. `skipped` AC requiere waiver humano versionado (no basta build).

```mermaid
sequenceDiagram
  participant P as PCX
  participant T as TCG
  participant A as Agent DSH
  participant Q as QA independiente
  P->>T: CONTRACT-002 nestjs@versión real
  alt READY
    T-->>P: graphHash + refs + freshness
  else STALE/MISSING/FAILED
    T-->>P: typed error + stale status
    P->>P: policy optional/required decide warn/BLOCKED
  end
  P->>A: ContextPack + scope autorizado
  A-->>P: resultado no autoritativo
  P->>Q: commitSHA + criterios AC independientes
  Q-->>P: passed/failed/skipped y evidence SHA
```

## 6. Métricas, pruebas negativas y release gate

Métricas de producto sugeridas: porcentaje consultas `READY` con sourceRefs completas; tasa STALE/MISSING; error ratio por code; p50/p95 tiempo query; número de invalid digests detectados; número de logs con redaction; reproducibilidad por OS; memory peak en consulta y aggregate. Alertar si crecen MISSING o digest drift, pero no convertir métricas en aprobación de UC.

Gate release: **todos los tests TCG propios aplicables green**, build/typecheck/smoke Ubuntu/Windows por SHA, contract fixtures firmadas, consumer PCX/AG comprobado (si se anuncia integración), seguridad adverse green y docs EN/ES+`.agents` actualizadas. Si un test fue skipped, se etiqueta y bloquea según policy explícita. Rollback: versión CLI anterior, sin tocar graph publications y sin migraciones destructivas.

## 7. Comandos de reproducción (solo checkout temporal)

```bash
npm ci
npm run lint:types
npm test
npm run build
node dist/main.js --help
# Cuando esté implementado WP-01, con workspace TEMPORAL:
node dist/main.js technology:query --workspace "$TCG_TEMP_WORKSPACE" --technology nestjs --version 10 --question 'DTO validation' --json
```

`quality.yml` actual no instala Graphify externo. La fase 3 decidirá si sustituir tests unit por fake Graphify determinista o provisionar versión real pinada para integration; **no falsear tests omitiendo validación**.


---
