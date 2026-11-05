# ARGEns v6 · TCG · Estado de implementación y evidencia

> **Registro vivo — 2026-11-05.** Implementación exclusiva en `agents-total-integration`. El plan 01–11 contiene diseño/diagnóstico histórico de `main@6df893c`; los hechos de esta rama se verifican por código y CI de su commit. **No equiparar un unit test verde con integración PCX/AG ni con Graphify real.**

## Cambios aplicados

| WP | Estado de la rama | Evidencia de código | Límite / pendiente |
|---|---|---|---|
| **TCG-WP-01** CLI typed JSON | **Implementado productor v1** | `src/commands/technology-query.commands.ts`, `src/models/technology-context-result.ts`, `test/technology-query.service.spec.ts`, `scripts/smoke-technology-contract.cjs` | Certificar respuestas con Graphify real y consumidor PCX |
| **TCG-WP-02** Publicación/provenance | **Implementado core-only** | `src/services/published-graph-resolver.service.ts`, `src/services/technology-query.service.ts`, pointer/SQLite exactos | Composición certificada de librerías compatibles, compatibilidad AG sidecar v1 |
| **TCG-WP-03** Freshness/TOCTOU | **Implementado on-demand** | `RepositoryFingerprintService` actual + validación antes/después, errores typed | Benchmarks en repos grandes, políticas de caché opcionales |
| **TCG-WP-04** Seguridad/catálogo | **Mitigaciones implementadas** | CLI allowlist, path realpath, caps 64 KiB, opt-in logs con retención, clasificación humana preservada, consentimiento Git para commits divergentes | Auditoría especializada redaction completa/ACL multitenant en PCX |
| **TCG-WP-05** Vocabulario C3/C6/C7/C9 | **Productor normalizado, consumidores pendientes** | contrato `TechnologyContextResultV1`, `docs/contracts/technology-context-result.v1.schema.json` | Validación y adopción formal por repos AG/PCX (fuera de este repo) |
| **TCG-WP-06** Fallos/recovery | **Fortalecido** | reconciliación exige pointer inmutable, hash, sourceFingerprint, último SQLite, Graphify-version | Generations GC con dry-run, fixture fallos crash reales, performance con índices grandes |
| **TCG-WP-07** CI multi-OS | **Mitigado y monitoreado** | stub Graphify en unit, rutas portables, `.github/workflows/quality.yml`, CLI smoke en binario | Graphify real no instalado/provisionado por CI; verificar SHA/head vigente |
| **TCG-WP-08** .agents | **Actualizado sin recrear** | `.agents/features/graph-query.md`, boundaries, integrations, testing, graph-lifecycle, risks, Git safety | Runner/PCX debe honrar precedencia de sus propios contextos |
| **TCG-WP-09** Fixtures producer/consumer | **Producer publicado y verificado** | `test/fixtures/contracts/technology-context/v1/*`, Ajv JSON Schema & negative fixtures | No existen pruebas *consumer* ejecutadas dentro de AG/PCX |

## Contrato CLI

```sh
tcg technology:query --workspace "/ruta/catalogo" --technology nestjs --version 10 --action query --question "DTO validation" --json
# 0 READY / 3 STALE / 4 MISSING / 2 FAILED
```

READY exige: core catalogado y aprobado, versión compatible exacta, inspección READY SQLite, puntero schema 2, SHA256, fingerprint fresco, Graphify instalado con versión de publicación. No hace pull/rebuild ni modifica código. Las respuestas de Graphify permanecen **datos no confiables** marcados INDEX con provenance a nivel repositorio; no se inventan file/line refs.

## Secuencia de evidencia

- **Baseline histórica:** `main@6df893c`, run 41943945018, Linux/Windows en rojo por spawn Graphify y rutas.
- **Rama de implementación:** [commits](https://github.com/charlietyn/tech-context-graph/commits/agents-total-integration).
- **Acciones CI de rama:** [Quality](https://github.com/charlietyn/tech-context-graph/actions/workflows/quality.yml). Un histórico verde **no** certifica el HEAD si hubo commits nuevos.
- **Unit tests:** usan doubles de Graphify y simulan casos READY/STALE/MISSING/FAILED; **no** implican Graphify real.
- **CLI Smoke:** corre el `dist/main.js` compilado en Windows/Ubuntu con respuesta tipada a workspace inexistente; verifica JSON único/código de salida. No cubre consulta exitosa con Graphify real.

## Requisitos de integración global antes de declarar ARGEns completo

1. **PCX:** adapter para TCG `TechnologyKnowledgePort`; timeout, terminal process lifecycle, ACL workspace, matriz optional/mandatory, hashes ContextPack, contratos de autorización y evidencia QA. Se implementa en PCX, no aquí.
2. **Apps Generator:** certificar mapping sidecar/meta `schemaVersion 1` vs manifest TCG `2.0`; seleccionar versión por target, sin fallback multiversión; C6 hash y C7/C9 receipts del generador. Se implementa en AG.
3. **Real Graphify E2E:** instalar versión fijada, obtener grafo de NestJS 10/11 y una librería compatible, query/explain/path, contrastar contra source file, medir memoria; anexar checks con SHA del binario y grafo. No se ha ejecutado con un Graphify externo real desde GitHub Actions.
4. **UX y agentes:** PCX tiene negocio y agentes; la UI Nuxt consume PCX. DeepSeek Harness bajo política/aislamiento PCX; TCG jamás gestiona tickets, tareas o aprobación de UC.
5. **Rollout:** marcar CONTRACT-002 1.0 como experimental hasta que consumidores CI publiquen validación de fixtures. Prohibido merge automático a main o declarar KwikVet UC-TH-001 INTEGRATED_VERIFIED únicamente por grafo tecnológico.

## Garantías de alcance

Solo se escribe `charlietyn/tech-context-graph` y la rama `agents-total-integration`. `main` y otros repos sin cambios. Se preserva la diferencia entre hechos (E-R, E-CI) y propuestas/pendientes (P/B). Los artefactos locales `.tcg/`, credenciales, tokens y grafos no se agregan a Git.
