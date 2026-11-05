# 06 · Contratos cruzados y mapa de responsabilidades

## 1. Ownership y anti-corruption boundaries

| Sistema | OWNER real | PRODUCER | CONSUMER | Prohibiciones |
|---|---|---|---|---|
| **PCX** | decisiones/UC/AC/Delivery/QA/RBAC/Git leases | contratos C7, packs, evidence final, API delivery | AG C6/C9, TCG CONTRACT-002, Harness receipts | no delegar AC ni permisos a LLM |
| **AG** | schema canónico, target/profile genéricos, generador y `.agents` de artifact | C6, C9, handoff/ownership | C7 PCX, knowledge de TCG | no implementar UC business específica |
| **TCG** | repos source aprobados, Graphify, versiones/freshness | **CONTRACT-002** (propuesto), refs técnicas | Graphify externo, manifests del workspace | no estado UC/merges/approval ni API inventada |
| **UI Nuxt** | presentación/BFF | solicitudes operator, vistas | PCX REST/OpenAPI | no Git directo, auth de negocio ni estado autoritativo |
| **Harness** | ejecución sesiones/tools | eventos/resultado no autoritativo | task pack PCX y sandbox host | no decidir integrated/QA/merge |
| **Superagent** | ninguna en ARGEns | referencias de patrones | documentación externa | no ejecutar segundo control-plane |

**Contra doble fuente:** `TCG.repository.catalogStatus` **no** es `PCX.artifact.readiness`; `TCG.graphHash` **no** es `PCX.ContextGraphRevision`; `AG.technology profile` **no** es versión publicada de Graphify; `AG .agents` generado **no** es `.agents` de TCG; `DSH successful` **no** es `INTEGRATED_VERIFIED`.

## 2. Contratos existentes C3/C6/C7/C9 (NO implementar aquí)

| ID | Productor → consumidor | Transporte actual auditado / estado | Problema exacto | Trabajo futuro responsable |
|---|---|---|---|---|
| **C3** UseCaseIntent | PCX → AG | JSON CLI `dbig` legacy 1.0/1.1; 2.0 en branch PCX histórico | 2.0 añade contextKind/packageId/bindings y UC sin entidades; AG 1.x no validado para ello | PCX+AG: proyección compatible o nuevo DeliveryPackage; fixtures CT-007..009 |
| **C6** AppsGeneratorCapabilities | AG → PCX → UI | `dbig capabilities --json`, schemaVersion `1.0`, `capabilityHash` SHA256, validador PCX `z.object(...).strict()` | AG emite `schemaBuilder`, receptor PCX estricto no lo acepta en el corte del código inspeccionado; revisar 2 SHAs actuales antes de fijar resolución | AG+PCX P0/F0: campo explícito negociado + hash deterministic + tests CT-001..003 |
| **C7** TechnologyPlan/Snapshot | PCX → AG | JSON CLI parcial con coordenadas target/version/profile, hash C6 | version/profile/order/`outputKey` + no drift; **Nuxt es Vue profile** | AG+PCX F0/F3 CT-004..005 |
| **C9** ApplicationGenerationReceipt | AG → PCX | receipt por artifact status/runId/outDir/hash parcial | `completed` no asegura Git baseline, `.agents` verificada o readiness; parcial no puede colapsarse | AG+PCX F3–F5 CT-006/011–015 |

**Evidencia nueva real:** `AG/src/capabilities/apps-generator-capabilities.ts:L42-L60@17d758...` define schema con `schemaBuilder` (campos presentes en interfaz); `PCX/libs/automation/src/app-generation/apps-generator-capabilities.contract.ts:L46-L59@2e77...` hace `.strict()` sin ese campo y recomputa SHA `L77-L90`. El diff sí está respaldado por archivos actuales; no se ejecutó intercambio real de C6.

## 3. Contrato clave TCG → PCX: CONTRACT-002 TechnologyContextResult/1 (PROPUESTO)

### Ficha negociable

| Campo | Estado y valor propuesto |
|---|---|
| **CONTRACT-ID** | `CONTRACT-002` (preservado) |
| **Producer** | TCG `technology:query` CLI futura |
| **Consumer** | PCX `TechnologyKnowledgePort` adapter futuro; AG `TechContextGraphClient` reutiliza vocabulario |
| **Transport** | **PROPUESTA:** `spawn(..., argv, shell:false)` stdout JSON, stderr diagnostics. **VERIFICADO:** TCG hoy usa `runProcess` y `GraphifyCliService.query()` desde TUI, no expone CLI query |
| **Schema** | versión `1.0`, entrada technology/versionConstraint/question/action/maxResults/revision?; salida `READY|STALE|MISSING|FAILED`, graphHash, graphifyVersion, inspectionAt, repoCommit, sourceRefs, warnings, errors |
| **Auth** | TCG CLI tiene ACL del OS/local workspace, no RBAC; **PCX debe autorizar al caller/tenant y restringir workspace**, no delegarlo |
| **Versioning** | Version contract `1.0`; `graphifyVersion` del productor externo, `technologyVersion` catálogo, `graphDigest` de graph.json, `sourceFingerprint` por repo; version slots separados |
| **Timeout** | TCG `captureGraphify` 120000 ms **existente**; consumer deadline menor o suficiente con kill + grace **PENDIENTE** |
| **Retry** | idempotent read-only solo errores transitorios; retries en consumer policy; no implicit rebuild o pull |
| **Idempotency** | request hash sobre stable fields + pinned revision; misma revisión -> mismo resultado semántico; timestamps volátiles excluidos |
| **Observability** | `correlationId`, `status`, `reason`, duration y digests; stdout JSON, stderr sin secretos |
| **Error map** | INVALID_INPUT, VERSION_MISMATCH, GRAPH_MISSING, STALE_GRAPH, INTEGRITY_FAILED, TIMEOUT, GRAPHIFY_UNAVAILABLE, QUERY_FAILED, SOURCE_CHANGED, OUTPUT_TOO_LARGE |
| **Security** | allowlist action/technology, approved source, realpath confinement, max bytes; Graphify text untrusted |
| **Testing** | TC-001..004, TCG-T01..T09, fixture consumer PCX; `skipped != passed` |

### Ejemplo de request JSON (PROPUESTO)

```json
{
  "schemaVersion": "1.0",
  "technology": "nestjs",
  "versionConstraint": "10",
  "question": "Where is DTO validation implemented?",
  "action": "query",
  "maxResults": 6,
  "correlationId": "pcx-delivery-demo-001"
}
```

### Ejemplo de respuesta STALE (PROPUESTA, valores ficticios deliberados)

```json
{
  "schemaVersion": "1.0",
  "status": "STALE",
  "technology": "nestjs",
  "requestedVersion": "10",
  "sourceRefs": [],
  "matches": [],
  "warnings": ["Previously published graph no longer matches source fingerprint"],
  "queryDurationMs": 0,
  "correlationId": "pcx-delivery-demo-001",
  "error": { "code": "STALE_GRAPH", "retryable": false, "message": "Refresh required before trusted use" }
}
```

**No usar hashes inventados de ejemplo como evidencia real.** Para `READY`, `sourceRefs` deben incluir `graphDigestSha256`, version, repoCommit, publication pointer `inspectionId`, y `fileRef` solo si Graphify lo expone y se verifica. Un `READY` sin refs/digest no satisface CONTRACT-002.

### Compatibilidad con TCG/AG reales

- **TCG** `TechnologyGraphService.writeTechnologyManifest()` guarda `technology.json` v2 con `members[].key`, `technologyVersion`, `technologyConstraints`, `inspectionStatus`, `graphPath` (`src/services/technology-graph.service.ts:L228-L246`). **No incluye `repoCommit` ni digest por miembro**: resolver desde publicación + Git en lectura, o ampliar sidecar con migración compatible.
- **TCG** agregado `aggregate.json` v2 guarda `inputSignature`, `graphDigest` y `generatedAt` (`L102-L166`) pero puede mezclar versiones de una tecnología; no recomendarlo para `nestjs@10` si agrega 10 y 11.
- **AG** `src/codegen/tech-graphs/tech-graph-context.ts:L11-L47@17d758...` ya evita fallback al agregado en request versionada y exige core compatible; reproducir esta regla, **no crear selector contradictorio**.
- **AG** `TechGraphMetadata` v1 es sidecar propiedad AG (`tech-graph.types.ts:L33-L44`); **no** reetiquetarlo como `technology.json` v2 de TCG.
- **AG** `TechContextGraphClient` usa spawn/shell:false y Windows .cmd shim resolution (`tech-context-graph.client.ts:L45-L103`). No es necesario reemplazarlo, pero su runner **no muestra timeout explícito ni abort signal** en las opciones `L13-L29`; investigar sin asumir prevención de hangs. Negociar capacidades/fixtures.

## 4. CONTRACT-001..016: responsabilidad TCG y dependencia

| ID | Nombre | TCG participa como | Qué debe comprobar / estado |
|---|---|---|---|
| CONTRACT-001 | GeneratedArtifactHandoff/1 | externo/solo consumidor indirecto | AG declara; PCX verifica `.agents`/locks; **PROPUESTO**, no TCG |
| CONTRACT-002 | TechnologyContextResult/1 | **PRODUCER** | WP-01/02/03/04/06/09, transport CLI JSON propuesto |
| CONTRACT-003 | UseCaseDeliveryPlan/1 | no owner | PCX planifica; TCG no WorkUnits |
| CONTRACT-004 | AgentTaskExecutionRequest/1 | no owner | PCX a harness runtime, no TCG |
| CONTRACT-005 | AgentExecutionReceipt/1 | fuente indirecta de techRefs | Git/QA/harness generan receipt; TCG aporta graphHash autenticado |
| CONTRACT-006 | TaskContextPack/1 | fuente técnica opcional | PCX compone; TCG da refs, no business |
| CONTRACT-007 | GitWorkspaceManifest/1 | no owner | PCX workspace de ejecución; no reutilizar Git pull TCG |
| CONTRACT-008 | QualityGateReceipt/1 | sujeto a QA cross-repo | Graph READY no implica tests pasados; TCG propio reporta suites sin inventar QA UC |
| CONTRACT-009 | Delivery REST/OpenAPI v1 | no owner | PCX API, UI BFF; TCG no server |
| CONTRACT-010 | GeneratedSourceOwnershipManifest/1 | no owner | AG ownership; TCG no escrituras sobre artifacts |
| CONTRACT-011 | SchemaImpactAssessment/1 | no owner | PCX distingue impactos DB; TCG no infiere DDL |
| CONTRACT-012 | NormalizedExecutionEvent/1 | fuente contextual | PCX normaliza runtime; TCG status telemetry local distinta |
| CONTRACT-013 | ProviderResolution/1 | no owner | PCX policy; TCG no provider billing |
| CONTRACT-014 | TraceabilityEvidence/1 | techRefs opcionales | `graphHash`+`repoCommit` se conserva en ledger PCX |
| CONTRACT-015 | ArtifactReadiness/WorkUnitState | no owner | no mapear `TCG.READY` a READY_FOR_AGENT o integrated |
| CONTRACT-016 | Superagent Concept Mapping | análisis | patrones estudiados, **nunca API** |

## 5. Las trece integraciones X-01..X-13

| ID | Enlace | Estado de auditoría 4/11 → situación nueva | Owner / dependencia y test |
|---|---|---|---|
| X-01 | UI↔PCX | PARCIAL; TCG no interviene, no revalidado end-to-end | PCX+UI; no inventar OpenAPI |
| X-02 | PCX↔AG | **C6 drift confirmado estático aún** por archivos actuales; ejecución no probada | F0, CT-001..003 P0 |
| **X-03** | **PCX↔TCG** | PARCIAL, TCG solo TUI de query; **CONTRACT-002 CLI falta** | TCG WP-01+09, PCX adapter F8, TC-001..004 |
| X-04 | PCX↔DSH runtime | No integración certificada en este análisis | PCX F10, no TCG |
| X-05 | PCX↔Git Workspace | No validado; no confundir Git CLI TCG | PCX F9; worktree/leases |
| X-06 | DSH↔Git Workspace | No validado; sandbox externo requerido | PCX+DSH F10 |
| X-07 | DSH↔providers | Parcial histórico; billingMode no es TCG | PCX/provider policy |
| X-08 | PCX↔QA | Parcial histórico | PCX+QA F11; CI TCG separado |
| X-09 | PCX↔persistence | Parcial histórico; no exportar SQLite TCG | PCX owner ledger |
| X-10 | PCX↔workers | Base existente histórica, no test nuevo | PCX F7–F10 |
| X-11 | PCX↔Artifact Registry | Handoff C9 parcial; TCG no readiness | PCX/AG F4/F5 |
| **X-12** | **AG↔TCG** | **implementación parcial comprobada** `TechContextGraphClient`, `TechGraphLifecycleService`, `TechGraphContext`; contrato query v1 y freshness aún por negociar | AG+TCG WP-05+09; fixtures TC-001/TCG-T13 |
| X-13 | AG↔`.agents` generado | Implementación histórica parcial, **diferente de `.agents/` repo TCG** | AG/PCX F3/F5; CT-011..015 |

Para X-01/X-04..11/X-13 la tabla refleja el alcance de la auditoría documental heredada y **no constituye una comprobación de código actual** fuera de los seams expresamente recuperados. Las interacciones remotas con auth/timeouts/telemetry sin código observado se etiquetan `PENDIENTE`.

## 6. Consumer-driven contract tests y gating

1. Producer TCG emite fixtures exactos para `READY`, `STALE`, `MISSING`, `FAILED`, `VERSION_MISMATCH`, `INTEGRITY_FAILED` con schemaVersion y hash. Un script de compatibilidad valida parsers consumers AG+PCX sobre las mismas fixtures; **no importar archivos TS internos de otro repo**.
2. AG y PCX publican una tabla version negotiation: `minVersion/maxVersion`, unknown discriminants → fail-closed, compatible changes con schema minor.
3. El `capabilityHash` C6 **no** es graphHash CONTRACT-002. La revisión del grafo y source repoCommit son inputs separate de ContextPack hash.
4. Fallo de TCG optional: PCX hace `warning` sin inventar contenido; fallo mandatory o digests inválidos: PCX bloquea tarea hasta replan humano.
5. Correlation: `pcx.deliveryId`, `taskId`, `correlationId` pueden incluirse en query; TCG no persiste actor IDs ni secretos. Errores y retry desde PCX adapter.
6. Bump de contrato exige change note, fixtures, consumer proof, rollback de CLI y compatibility matrix per target/profile.

## 7. Qué falta verificar para completar cada ficha

No se observó TechnologyKnowledgePort real de PCX con path confiable en la consulta de código por nombre; **PENDIENTE** descubrir ruta y semántica en checkout de PCX (solo lectura en este estudio). No hay acuerdo sobre `format` Graphify JSON; **PENDIENTE** probar versión real de Graphify y formalizar parser. No hay auth multi-tenant TCG: **no asignar `AUTHORIZATION=EXISTENTE` a un binario local**. El timeout de PCX hacia TCG no se comprobó: **PENDIENTE**, no completar con suposiciones.


---
