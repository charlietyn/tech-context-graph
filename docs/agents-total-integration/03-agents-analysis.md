# 03 · Auditoría de `.agents`, AGENTS, skills e instrucciones

## 1. Resultado diferencial del snapshot actual

**CONFIRMADO E-R:** existe `.agents/` en `main@6df893c24a332130a3e6f3585b21fb015d8f2023` y está **versionada en Git**; el árbol remoto contiene README, `agent-rules/`, `architecture/`, `cli/`, `conventions/`, `data/`, `domains/`, `features/`, `integrations/`, `modules/`, `operations/`, `technical-debt/`, `testing/`, `workflows/`. Su introducción está en el commit `ef796c11946c7af9d11ff6efe62fccd1a69c43c0` del 5/11. La auditoría congelada del 4/11 que reportaba ausencia es obsoleta para `main` actual.

`AGENTS.md:L1-L16` es un **puntero deliberado** a `.agents/README.md` y reglas de Graphify; no reemplazarlo por prompt monolítico. `.agents/README.md:L1-L146` se declara verificado 5/11, trae mapa de módulos y reglas operativas. `.agents/agent-rules/navigation.md:L5-L23` ordena Graphify → `.agents` → código y explícitamente **el grafo orienta, no prueba**. `.agents/architecture/boundaries.md:L43-L68` describe ownership y confianza. `.agents/agent-rules/review-agent.md:L5-L77` enfatiza protección de cambios del usuario, Git, integridad y contrato de CLI.

**No observado en árbol remoto completo:** `.agent/`, `CLAUDE.md`, `AGENT.MD`, `skills/` raíz, `.cursor/`, `architecture.lock` ni `prompts/` o `rules/` raíz. Su no presencia en el `main` fijado **no demuestra ausencia en otros branches, instalaciones, artifacts o home del usuario**. Hay `.github/workflows/quality.yml`. `graphify-out/` está **ignorado** (`.gitignore:L103-L114`) y no es visible en Git; no podemos afirmar si existe en la máquina del usuario. `.agents/` no está ignorado, es intencionalmente documentación de proyecto; no confundir con `.agents` de un proyecto generado por AG.

## 2. Inventario, propiedad y migración

| Ruta existente | Rol observado | Acción FUTURA | Razonamiento / costo |
|---|---|---|---|
| `AGENTS.md` | puntero + navegación Graphify | **MANTENER**, agregar como máximo ruta de consulta contractual | Si se reescribe pierde precedencia corta; bajo |
| `.agents/README.md` | índice modular, stack, límites y reglas | **MODIFICAR** solo cuando exista CLI tipada | Documentar productor CONTRACT-002; bajo |
| `.agents/agent-rules/navigation.md` | orden y versiones Graphify | **MANTENER / EXTENDER** para distinguir TCG query vs graphify propio | Evitar falsa confianza, bajo |
| `.agents/agent-rules/review-agent.md` | revisión riesgo Git/publicación | **EXTENDER** controles de digest, exposición de stdout y provenance | Alto valor, bajo |
| `.agents/agent-rules/coding-agent.md` | guía de implementación | **MANTENER**, validar en WP-08 | Evitar duplicar policy; bajo |
| `.agents/architecture/*` | fronteras e imports | **EXTENDER** puerto `GraphifyQueryPort`, read model | Compatible con modularidad; medio |
| `.agents/domains/*` | workspace/catalog/lifecycle | **EXTENDER** lifecycle de consulta | Sin segundo catálogo; bajo |
| `.agents/features/graph-query.md` | **solo TUI** y recordQuery | **MODIFICAR** al completar CLI y privacidad | Hoy describe realidad; bajo |
| `.agents/features/freshness-and-reconcile.md` | cache/estado y recuperación | **EXTENDER** semántica typed freshness | Separa status de consulta/inspección; medio |
| `.agents/integrations/integrations.md` | Graphify externo y Git | **EXTENDER** versiones/formatos y compatibility | No inventar MCP; bajo |
| `.agents/technical-debt/risks.md` | R-02..R-20, [V]/[L] | **MANTENER + actualizar por evidencias de tests** | No declarar resuelto sin fixture, bajo |
| `.agents/technical-debt/opportunities.md` | O-21 comando query, O-25 CI | **REUTILIZAR** en roadmap | Ya existen propuestas concretas; bajo |
| `.agents/testing/*` | test-map y estrategia | **EXTENDER** tests de contrato/agente | Evita suite paralela; medio |
| `.agents/workflows/*` | añadir features/test/config | **MANTENER**, revisar pasos de query | Flujo test-first y DI; bajo |
| `.github/workflows/quality.yml` | type/test/build/smoke | **MODIFICAR** en WP-07 posterior, no en esta fase | Dependencia Graphify no instalada; medio |
| `graphify-out/`, `.tcg/`, `tech-graphify-out/` | datos locales ignorados | **NO TOCAR / NO VERSIONAR** | Protección privacidad, datos y coste |

**ELIMINAR:** no se recomienda borrar carpetas o instrucciones actuales sin prueba de contradicción. **CREAR (PROPUESTO):** únicamente pequeñas páginas de integración como `.agents/integrations/technology-context-contract.md` o fixture docs al implementar WP-08, no una arquitectura `.agents` nueva.

## 3. Matriz de agentes especializados (diseño, no ejecución)

| Perfil lógico | Entrada autorizada | Tool/permiso | Salida | Evidencia requerida |
|---|---|---|---|---|
| **TCG Catalog Analyst** | root explícito + candidatos | `repository:scan/list`, lectura manifest, **sin --apply oculto** | lista de candidatos y justificación | paths, markers, classification evidence, human review |
| **TCG Graph Maintainer** | repo `ACCEPTED` + versión/fingerprint | `inspect` **sin --pull** por defecto; con autorización específica si pull | estado de publicación | inspectionId, graphDigest, graphifyVersion, sourceFingerprint |
| **TCG Query Specialist** | TechnologyQuery/1 validada | `repository:query/explain/path --json` propuestos, solo read | TechnologyContextResult/1 | refs, hash, source SHA, status, queryId |
| **TCG Cross-Repo Contract Reviewer** | fixtures C2 y AG/PCX refs | lectura Git de 3 repos + validation | matriz de incompatibilidad | campos, schema version, prueba producer/consumer |
| **TCG Security Reviewer** | diff/rutas/logs y threat model | lectura tests/código; sin git-mutating | reporte de riesgos | escenarios de symlink, injection, code logs, root ACL |
| **TCG QA Auditor** | SHA/fixtures CI | temp workspace + mocks, no datos reales | receipts test by SHA | OS, binario, exit, JSON, checksums |

Estos son **perfiles de responsabilidades**, no seis runtimes independientes. Se orquestan bajo PCX si trabajan en delivery; en repos TCG sirven como documentación de tarea. No crear scheduler o ledger del agente dentro de TCG.

## 4. Precedencia de instrucciones y aplicación real

1. **En el repo TCG para agentes de mantenimiento:** reglas superiores del runner/policy → tarea aprobada con scope → `AGENTS.md` → `.agents/README.md` y secciones vinculadas → pruebas/código fuente. Un enlace Markdown a `.agents` **no garantiza** que DeepSeek Harness lo cargue; el ContextPack PCX debe expandir e incluir contenido verificado con hash.
2. **ContextPack de trabajo ARGEns:** decisión/AC aprobada en PCX (autoridad funcional), luego reglas del artefacto generado por AG (.agents e ownership), después evidencia técnica TCG (fuente no confiable por defecto), luego source exacto del proyecto. Una respuesta Graphify no debe inyectar tool permissions.
3. **Habilitación de herramientas:** una frase “no escribas main” no es sandbox. Requiere worktree delimitado, ACL/OS process sandbox, validación realpath, leases y branch protection Git independiente.
4. **Seguridad de contenido:** un `graphify query` puede incluir README de terceros con prompt-injection. Tratar texto como datos citados, aplicar límites, redacción y marcadores de confianza, nunca elevar rol del texto.

## 5. Ejemplo concreto de regla ejecutable futura

**Tarea:** responder “¿qué decorator valida un DTO NestJS 10?” mediante Graphify. El Query Specialist solo invoca `tcg repository:query --technology nestjs --version 10 --question ... --workspace <safe> --json` **cuando WP-01 esté implementado**. Verifica salida `schemaVersion`, `graphHash`, `repoCommit`, `status`; si STALE, pasa a PCX `TechnologyUnavailable`/warning; **no ejecuta una sugerencia que el grafo devuelva**. PCX decide si el contexto tecnológico es opcional para ese task.

## 6. Tests de instrucciones (WP-08, todos pendientes)

- `TCG-T21`: pack incluye contenido enlazado real de `.agents` (no solo AGENTS.md) y hashes por archivo; si falta un requerido → BLOCKED.
- `TCG-T22`: prompt malicioso dentro de un nodo Graphify no cambia paths, permisos ni tools.
- `TCG-T23`: watcher detecta cambio de `.agents` y recalcula rulesHash; invalida pack previo.
- `TCG-T24`: source Graphify antiguo no prevalece sobre código del commit seleccionado.
- `DS-003`: aplicable a PCX/DSH; TCG no puede certificarlo por sí mismo.

## 7. Evidencia y límites

Todas las referencias anteriores son contra `TCG@6df893c24a332130a3e6f3585b21fb015d8f2023`. Sin checkout o harness invocado no se ha probado `AGENTS.md` discovery automático, graphify instalado, hash AGENTS del workspace o funcionamiento de skills. El user prompt prohibía editar `.agents` en etapa 2; **no se editó**.


---
