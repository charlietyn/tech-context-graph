# ARGEns v6 · Etapa 2 · Plan especializado de Tech Context Graph (TCG)

> **Estado actualizado (2026-11-05): rama `agents-total-integration` creada, documentos publicados e implementación de productor TCG en desarrollo y verificación.** Este README comenzó como auditoría previa a la autorización de GitHub; las observaciones históricas de `main@6df893c` se conservan como baseline, no como estado actual. Revisar [12-implementation-evidence.md](12-implementation-evidence.md) y los checks de GitHub Actions antes de inferir completitud.

> **2026-11-11:** planes TCG-1/2/3 ejecutados en local; resultado, evidencias por SHA, incompatibilidades y pendientes en [14-resultado-certificacion-tcg-2026-11-11.md](14-resultado-certificacion-tcg-2026-11-11.md).

**Rama de trabajo:** [agents-total-integration](https://github.com/charlietyn/tech-context-graph/tree/agents-total-integration). **No se modifica ni se fusiona `main`.** Todo cambio de producto en este repositorio deriva de la instrucción posterior y explícita del usuario de implementar el plan, que sustituyó el límite inicial de "solo documentación".

## Alcance y normas

- **Repositorio único modificado en esta implementación:** `charlietyn/tech-context-graph`. En esta etapa solo se autorizaron documentos bajo `docs/agents-total-integration/`.
- **Snapshot inspeccionado:** `main@6df893c24a332130a3e6f3585b21fb015d8f2023`, 2026-11-05 00:47:30 UTC. Base de auditoría anterior `4c0405bbf5f4d19ed1703f57fa2c1ca93f71364a` (26-10); `main` está **6 commits por delante**, 84 ficheros cambiados en el compare remoto.
- **Modo de auditoría original:** GitHub API + archivos del prompt. No hay checkout local del repo; `git ls-remote` desde el contenedor falló por DNS de `github.com`. En consecuencia **no se conoce `git status`, dirty files, worktrees ni `git diff --check` de un checkout de usuario**. El árbol remoto recursivo era completo (`truncated=false`). No se ejecutaron tests locales, Graphify ni build; sí se consultaron **logs reales de GitHub Actions**.
- **Ramas remotas observadas en auditoría inicial:** solo `main`; posteriormente se creó y verificó `agents-total-integration` mediante GitHub.
- **Otros repositorios:** solo lectura para contratos y patrones. `apps-generator@17d75856c065fb6bbe0568af00b1367e0cd3668b`, `proyect-context-graph@2e77b03d104213be9cfae3f9914f275199a1f885`, `deepseek-harness@fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`; `dsh-superagent-prototype@8c32a9dc5d72c033816c6a8110b37f40cf94fba4`.

## Conclusión ejecutiva

TCG es **un CLI NestJS/Clack v4.0.0**, con catálogo SQLite (`sql.js`), fuentes Git, Graphify externo, publicación de grafos por generaciones y agregado tecnológico. **En el snapshot original no había API REST, MCP propio ni CLI pública de consulta tipada**: la consulta Graphify real existe en `GraphifyCliService.query()` pero solo la invoca la TUI. Hay material reaprovechable sólido: `repository:inspect`, estados `NEVER/RUNNING/READY/STALE/FAILED/MISSING`, fingerprints `git-v2/files-v2`, `tcg-current.json` con `graphDigest`, `technology.json` y `aggregate.json`.

**Hallazgo nuevo crítico frente al prompt:** `.agents/` **ya existe** en `main`, fue introducido el 2026-11-05 (`ef796c...`). Es un manual modular con dominios, arquitectura, features, workflows, tests y deuda. Por lo tanto **no se debe recrear ni duplicar**; se propone una evolución quirúrgica y verificable.

**CI base histórica (antes de cambios):** workflow `Quality` run `41943945018` contra SHA base: Ubuntu **4/101 tests fallidos** (2 suites); Windows **5/101 tests fallidos** (3 suites). Logs verifican `graphify: spawn graphify ENOENT` (3 tests de migración), un assertion de paths Windows `RUNNER~1` vs `runneradmin`, y una prueba de label de workspace que usa rutas con semántica Windows en Ubuntu. Esas causas son los fallos **observados en este run**, no afirmación de que no haya otros.

### Entregables

| Documento | Propósito |
|---|---|
| [01-requirements.md](01-requirements.md) | Requisitos ARGEns y requisitos TCG, trazabilidad y aceptación. |
| [02-current-architecture.md](02-current-architecture.md) | Inventario fuente, diagrama actual, flujos, persistencia y CI. |
| [03-agents-analysis.md](03-agents-analysis.md) | `.agents` existente, precedencia, agentes especializados y enforcement. |
| [04-deepseek-patterns-analysis.md](04-deepseek-patterns-analysis.md) | Prototipo vs runtime, patrones adoptar/adaptar/descartar. |
| [05-target-architecture.md](05-target-architecture.md) | Ports/adapters incrementales, DTO, estados, controles y diagramas. |
| [06-cross-repository-contracts.md](06-cross-repository-contracts.md) | C3/C6/C7/C9, CONTRACT-001..016, X-01..13, detalles TCG-PCX-AG. |
| [07-gap-analysis.md](07-gap-analysis.md) | GAP actuales, clasificación, riesgos y fuente. |
| [08-implementation-plan.md](08-implementation-plan.md) | EPIC/Feature/WP/Task/Subtask: 9 work packages ejecutables. |
| [09-testing-strategy.md](09-testing-strategy.md) | Tests TC/CT/OPS, fixtures, fallos adversarios, CI multi-OS. |
| [10-execution-roadmap.md](10-execution-roadmap.md) | Secuencia TCG y dependencias globales F0–F15. |
| [11-risks-and-decisions.md](11-risks-and-decisions.md) | Decisiones humanas, peligros de Git, estados, bloqueos. |
| [12-implementation-evidence.md](12-implementation-evidence.md) | **Estado efectivo de código, CI, evidencias, pendientes y limitaciones por WP.** |
| [13-plan-ejecutable-contrato-tecnologico-y-validacion-local-2026-11-10.md](13-plan-ejecutable-contrato-tecnologico-y-validacion-local-2026-11-10.md) | Plan TCG-1/2/3. |
| [14-resultado-certificacion-tcg-2026-11-11.md](14-resultado-certificacion-tcg-2026-11-11.md) | **Resultado de TCG-1/2/3, C1/C2, CONTRACT-003 y grafos de C6.** |

### Política de evidencia

Usamos: **E-R** = fuente remoto/código verificado estáticamente en SHA; **E-CI** = logs históricos reales; **E-D** = documentación del repositorio verificada como texto, puede ser inexacta; **P** = diseño propuesto; **B** = bloqueado/no verificable. Cada conclusión remite a `archivo:Lx-Ly@SHA` o run URL; si no hay revisión runtime, nunca significa `test passed`.

### Fuentes primarias fijadas

- [TCG código a SHA](https://github.com/charlietyn/tech-context-graph/tree/6df893c24a332130a3e6f3585b21fb015d8f2023); [Actions run 41943945018](https://github.com/charlietyn/tech-context-graph/actions/runs/41943945018), [Actions histórico 40354696453](https://github.com/charlietyn/tech-context-graph/actions/runs/40354696453).
- [AG tech graph client](https://github.com/charlietyn/apps-generator/blob/17d75856c065fb6bbe0568af00b1367e0cd3668b/src/codegen/tech-graphs/tech-context-graph.client.ts); [AG schema C6](https://github.com/charlietyn/apps-generator/blob/17d75856c065fb6bbe0568af00b1367e0cd3668b/src/capabilities/apps-generator-capabilities.ts).
- [PCX schema C6](https://github.com/charlietyn/proyect-context-graph/blob/2e77b03d104213be9cfae3f9914f275199a1f885/libs/automation/src/app-generation/apps-generator-capabilities.contract.ts).
- [DeepSeek superagent](https://github.com/deepseek-ai/dsh-superagent-prototype/tree/8c32a9dc5d72c033816c6a8110b37f40cf94fba4); [Harness safety](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/SAFETY.md).

### Publicación y verificación actual

La rama y los documentos ya están publicados. Los commits de implementación incluyen cambios en `src/`, `test/`, `config/`, `.agents/`, `scripts/` y `.github/` sin alterar la rama `main`. El flujo reproducible es:

1. Inspeccionar [rama](https://github.com/charlietyn/tech-context-graph/tree/agents-total-integration) y [historial de CI](https://github.com/charlietyn/tech-context-graph/actions/workflows/quality.yml).
2. Revisar las evidencias en [12-implementation-evidence.md](12-implementation-evidence.md), distinguiendo suite de unidad, smoke CLI y E2E con Graphify real.
3. Ejecutar `npm ci && npm run lint:types && npm test && npm run build && node scripts/smoke-technology-contract.cjs` en checkout local autorizado; el resultado remoto de Actions solo corresponde al SHA que se reporta. Además, la [Graphify Real Integration #42034585042](https://github.com/charlietyn/tech-context-graph/actions/runs/42034585042) ya validó un grafo sintético code-only real contra `graphifyy==0.9.102` (READY/STALE).
4. Revisar manualmente en PR; no realizar merge automático a `main` ni asumir que consumidores PCX/AG ya implementaron el contrato.
