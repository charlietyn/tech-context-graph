# 01 · Requisitos y trazabilidad de TCG

## 1. Línea de producto no negociable

**PCX** gobierna requisitos, UC/AC, aprobaciones, delivery, QA y Git. **Apps Generator** construye solo base genérica, perfiles, artefactos y handoff. **TCG** mantiene fuentes tecnológicas aprobadas, estados de Graphify y consultas fundamentadas **por versión**. **UI** muestra el control-plane PCX; **DeepSeek Harness** ejecuta bajo política y sandbox externos. Esta división está en el prompt especializado, §§2–4, no es una afirmación de integración actual.

Tres entradas del sistema (documentación, DB-first, mixta) desembocan en delivery PCX; ninguna permite a TCG transformar documentación, conocimiento tecnológico o una respuesta LLM en regla de negocio aprobada.

## 2. Inventario de requisitos relevantes (IDs globales preservados)

| ID | Prioridad | Owner / TCG role | Evidencia actual y trabajo / criterio |
|---|---|---|---|
| REQ-001 | P0 | PCX / no owner TCG | TCG jamás escribe decisión UC/AC, aprobación o estado integrado. |
| REQ-002 | P0 | AG / colaborador | TCG no genera ni implementa negocio. |
| REQ-003 | P1 | TCG OWNER | Catálogo y consulta técnica con versión, fuente y frescura. |
| REQ-005 | P0 | PCX / consumidor | Separación estricta de control-plane y runtime; conocimientos son datos. |
| REQ-006 | P0 | PCX / no owner TCG | Git worktrees de delivery pertenecen PCX; TCG solo opera repos catalogados bajo permiso humano. |
| REQ-007 | P0 | PCX/QA / consumidor | Un grafo READY no acredita calidad AC. |
| REQ-008 | P0 | compartido, TCG proveedor | Producer/consumer fixtures y versionado exacto de CONTRACT-002. |
| REQ-010 | P0 | AG / no owner TCG | No hacer overwrite de artefactos generados como side effect del catálogo. |
| REQ-012 | P1 | AG / consumidor | Nuxt perfil de Vue, no target independiente; TCG representa tecnologías sin inventar targets. |
| REQ-013 | P0 | todos | E-R, E-CI, E-D y P explícitos; un build no prueba reglas. |
| REQ-014 | P0 | todos | No secretos ni rutas sensibles en ContextPack/JSON/logs del consumidor. |
| REQ-016 | P1 | PCX / TCG delimitado | Conflicto entre evidencia técnica y business aprobado bloquea; TCG no decide. |
| REQ-017 | P0 | PCX / investigación | Superagent se estudia como patrón; TCG no absorbe tickets ni políticas. |
| REQ-018 | P1 | compartido | `graphDigest`, fingerprints, graphifyVersion y hashes referenciados por task pack. |
| REQ-019 | P0 | este ejercicio | Solo docs en rama propietaria; sin implementación. Bloqueado por permisos de integración. |
| REQ-031 | P2 | AG / TCG colaborador | Reutilizar cliente `TechContextGraphClient` AG; no imports internos. |
| REQ-036 | P1 | TCG OWNER | CLI tipada `query/explain/path`, salida `TechnologyContextResult/1` y errores. |
| REQ-037 | P1 | TCG OWNER | Distinguir READY/STALE/MISSING/FAILED con proof (fingerprint, digest, SHA). |
| REQ-038 | P2 | TCG OWNER | Roots explícitas y aprobación humana, nunca tecnología inferida del nombre. |
| REQ-039 | P1 | TCG OWNER | CLI sin REST ni MCP propio; Graphify MCP opcional externo. |
| REQ-040 | P1 | TCG OWNER | TIMEOUT/STALE/MISSING tipados, fail-closed según policy PCX. |
| REQ-041 | P1 | TCG OWNER | Resolver CI Ubuntu/Windows con evidencias y fixtures sin red. |
| REQ-042 | P2 | TCG OWNER | Graphify query/path/explain para navegar; contrastar con fuente real. |
| REQ-043 | P1 | TCG OWNER | Allowlist operaciones, roots, args, budgets, output caps y no shell. |
| REQ-044 | P2 | TCG+AG+PCX | Un vocabulario de versión, hash, provenance y status compartido. |
| REQ-053 | P1 | PCX / TCG proveedor | TCG aporta refs versionadas al pack; PCX compone autoridad/contexto. |
| REQ-063 | P0 SALIDA | PCX / TCG proveedor | KwikVet UC-TH-001 solo certificación de PCX/QA, TCG como ayuda técnica versionada. |
| REQ-078 | P1 | PCX / TCG observador | Evaluar patrones DeepSeek sin promover API inexistente. |

**Nota:** el documento fuente habla de 82 requisitos globales, no reproduce todos aquí. No se renumeran IDs ajenos. El estado de este plan es **P** salvo evidencias código indicadas en §3. Nuevas propuestas desde REQ-083, sujetas a coordinación global.

## 3. Requisitos TCG derivados de auditoría (propuestas nuevas)

| ID propuesto | Prio | Requisito | Owner | Consumidor | Aceptación |
|---|---|---|---|---|---|
| REQ-083 | P0 | Resolución de grafo publicada **por digest y versión** y no por path sin verificar | TCG | PCX/AG | Cambiar puntero o bytes durante lectura devuelve DRIFTED/FAILED y no output certificado. |
| REQ-084 | P1 | Consulta automatizable read-only con `--json` **solo JSON en stdout** y exit codes estables | TCG | PCX/AG | CLI E2E parsea un único objeto; STDERR solo diagnóstico; no efectos de catalogación. |
| REQ-085 | P1 | Revisión del catálogo no destruida por re-scan | TCG | Usuarios/AG | Candidate ACCEPTED retiene clasificación manual; nombres colisionados no abortan lote. |
| REQ-086 | P0 | Límite de confianza del conocimiento recuperado | TCG | PCX | Texto Graphify no puede elevar autorización, instruir herramientas ni reemplazar AC. |
| REQ-087 | P1 | Query logs configurables/redactados/limitados, retention | TCG | Operadores | Desactivar contenido, TTL, tamaño máximo y privacidad testeados. |
| REQ-088 | P1 | Reconciliación DB/filesystem reproducible e inmutabilidad de publicación | TCG | AG/PCX | Crash antes/después de rename conserva última publicación válida; no READY con digest roto. |

## 4. Matriz de aceptación por comportamiento

| Capacidad | Given | When | Then | Tests |
|---|---|---|---|---|
| Consulta versión | NestJS 10 y 11 en catálogo, ambas approved | PCX pide `nestjs@10` | Solo core 10 y libs compatibles, refs y graphHash, nunca agregado de 10+11 | TC-001, TCG-T01, TCG-T04 |
| Staleness | Fingerprint original F1, código cambia a F2 | Consulta F1 | `STALE`, sin salida autorizada silenciosa | TC-002, TCG-T05 |
| Missing | No graph.json/publicación | `query` | `MISSING` tipado, instrucción reparar, ninguna alucinación | TC-003, TCG-T03 |
| Timeout | Graphify se bloquea | timeout controlado | `FAILED/TIMEOUT`, proceso terminado, no hang de PCX | TC-004, TCG-T06 |
| Fuente manipulada | grafo con digest incorrecto | lectura | Bloquea antes de parsear nodes | TCG-T07 |
| Política de permisos | pregunta Graphify contiene orden maliciosa | empaquetar resultado | Solo dato citado/sanitizado; sin tool execution | TCG-T08 |
| CI multi-OS | fixtures temp en Linux/Windows | npm ci/test/build | 0 fallos, logs y SHA exactos | OPS-001, TCG-T10 |

## 5. Evidencia de diseño actualmente verificable

- **Catálogo/estados:** `src/models/repository-state.ts:L3-L44@6df893c24a332130a3e6f3585b21fb015d8f2023`; `src/persistence/repository-store.service.ts:L96-L133@6df893c24a332130a3e6f3585b21fb015d8f2023`.
- **Fingerprint:** `src/services/repository-fingerprint.service.ts:L11-L59@6df893c24a332130a3e6f3585b21fb015d8f2023`, incluye HEAD/status/changes + ignore; no es lo mismo que repoCommit.
- **Publicación:** `src/services/graphify-cli.service.ts:L137-L173,L239-L262@6df893c24a332130a3e6f3585b21fb015d8f2023`, `tcg-current.json` con digest.
- **Agregado:** `src/services/technology-graph.service.ts:L102-L166,L228-L246@6df893c24a332130a3e6f3585b21fb015d8f2023`.
- **Consulta:** `src/services/graphify-cli.service.ts:L277-L300,L386-L390@6df893c24a332130a3e6f3585b21fb015d8f2023`, actualmente output stdout texto y escritura a `graph_queries`.
- **CLI:** `src/commands/repository-control.commands.ts:L15-L95@6df893c24a332130a3e6f3585b21fb015d8f2023` no contiene `repository:query`, aunque servicio sí consulta desde TUI `src/ui/console-ui.service.ts:L411-L413,L514-L539`.

## 6. Dependencias bloqueantes

**D1:** consumidor PCX todavía necesita puerto/adapter verificable de `CONTRACT-002`; no afirmar endpoint. **D2:** AG ya tiene cliente/lifecycle y necesita fixtures y vocabulario de versiones equivalente; no modificar AG en esta rama. **D3:** Graphify externo fijado por versión y pruebas deterministas. **D4:** CI rojo impide declarar integración fuerte hasta corregir y revalidar.


---
