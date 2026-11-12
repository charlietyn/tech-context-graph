# 11 · Riesgos, contradicciones, decisiones y bloqueo Git

## 1. Registro de riesgos priorizado

| ID | Severidad | Riesgo y evidencia | Tratamiento / responsable |
|---|---|---|---|
| R-TCG-01 | **P0** | **Publicación bloqueada**: `create_branch('agents-total-integration', sha=6df893c)` devolvió `403 Resource not accessible by integration`. Metadata GitHub informaba `push/admin`, pero la operación real fue denegada. | Cambiar permisos de instalación GitHub App o publicar manualmente por identidad autorizada; **no inferir éxito ni reintentar escritura a main**. Owner humano. |
| R-TCG-02 | **P0** | `--pull` puede reconciliar ramas diverged y reescribir commits locales (`repository-git.service.ts:L102-L107`, `repository-control.commands.ts:L76-L78`). | Consentimiento específico y backup ref, no usar en auditoría; WP-04. |
| R-TCG-03 | **P0** | CLI query JSON no existe; `GraphifyCliService.query` interno devuelve texto (`L277-L301`). | CONTRACT-002 producer/consumer; WP-01; no invocar endpoint ficticio. |
| R-TCG-04 | **P0** | `READY` de SQLite no garantiza revisión al momento de consulta; Graphify stdout no lleva citas certificadas. | Resolver pointer/digest/fingerprint/source ref before+after; WP-02/03. |
| R-TCG-05 | **P0** | Source Graphify puede contener instrucciones maliciosas; tool execution no debe interpretarlas. | Data-only trust, sanitización, scoped sandbox PCX; WP-04/08. |
| R-TCG-06 | **P0** | Actions run `41943945018` FAILURE en ambos OS; 3 tests migración requieren Graphify no instalado; fixtures paths divergen. | WP-07, no false green ni skips. |
| R-TCG-07 | P1 | Re-scan sobrescribe clasificación ACCEPTED, collisions key abortan lote (`.agents/technical-debt/risks.md:L7-L21`, documentado [V]). | Repro aislamiento + preservar edición humana; WP-04. |
| R-TCG-08 | P1 | Graphify `query` archiva input/output completo `graph_queries` (`graphify-cli.service.ts:L288-L300`, `repository-store.service.ts:L231-L236`). | metadata-only, límites/redacción/retention; WP-04/06. |
| R-TCG-09 | P1 | `aggregate.json` familiar puede mezclar cores incompatibles (TCG `technology-graph.service.ts:L102-L166`); AG ya prohíbe fallback por versión. | Selector por core y constraints, no agregado en version query; WP-02/05. |
| R-TCG-10 | P1 | SQLite `sql.js` export full + FS pointer rename no son transacción común (`sqlite-database.service.ts:L116-L121`). | Crash/reconcile matrix, backup migrations; WP-06. |
| R-TCG-11 | P1 | `AG.TechContextGraphClient` carece de timeout en options inspeccionadas `L13-L29`, process child puede no finalizar si PCX consume sin watchdog. | Timeout/cancel e integración consumers; AG owner, WP-09 coordinación. |
| R-TCG-12 | P1 | `.agents` ahora versionada, auditoría 4/11 decía ausente: riesgo de diseñar una segunda estructura duplicada. | Reutilizar manual existente; WP-08. |
| R-TCG-13 | P1 | `C6` AG producer con `schemaBuilder` vs PCX `.strict()` receptor se mantiene en archivos actuales. | F0 AG+PCX, bloqueante del E2E global, no corregir desde TCG. |
| R-TCG-14 | P1 | Graphify externo versionamiento/salida sujeto a cambios, CI no provisionado (`graphify-cli.service.ts:L188-L190`, quality.yml). | pin+fixtures+smoke real; WP-06/07. |
| R-TCG-15 | P2 | Grafo/aggregates grandes con sync JSON + generation retention (`.agents/technical-debt/risks.md:L42-L55,L99-L105`). | cap y benchmarks, dry-run prune; WP-06. |
| R-TCG-16 | P2 | Features config YAML que validan pero no operan documentadas (`.agents/technical-debt/risks.md:L25-L39`). | conectar o deprecar con migration; no vender como controles de seguridad. |
| R-TCG-17 | P1 | Modelo de gobernanza confuso: llamar “control-plane” a TCG (CLI local) y PCX (delivery) puede duplicar autoridad. | Documentar TCG = plano de control **del catálogo técnico local**, PCX = control-plane **del negocio y agentes**. |

## 2. Contradicciones que no se resuelven con suposiciones

1. **`main` nuevo vs auditoría antigua:** `main@6df893c24a332130a3e6f3585b21fb015d8f2023` tiene `.agents` que la auditoría del 4/11 no vio; los hallazgos antiguos se revalidan. Compare `4c0405b...` → `6df893c` = +6 commits.
2. **AG C6 vs PCX C6:** `schemaBuilder` sigue fuera del schema estricto PCX; revisar productor consumidor con fixtures, no eliminar `.strict()`.
3. **PCX C3 2.0 vs AG C3 1.x:** no marcar compatible sin prueba. TCG no interviene.
4. **`AGENTS.md` y `.agents`:** son reglas Markdown, pero Harness no garantiza seguir links o respetar `writeScopes` como ACL; necesitan pack expansion + sandbox.
5. **TCG docs `graphify` vs Graphify external:** TCG `graphify-out` es grafo del repo de TCG; `tech-graphify-out` son fuentes de catálogo externas. No mezclarlos.
6. **Quality GREEN parcial:** 97 tests pasados de 101 en Ubuntu no constituyen suite verde; Build ni CLI smoke se ejecutaron después del Test fallido en workflow.
7. **Superagent vs Harness:** prototype con Engine/SQLite/Panel no es API de ejecución de DSH ni policy PCX.
8. **Nuxt vs target:** Vue profile; tecnología `nuxt` en catálogo no la convierte en target AG independiente.
9. **C9 completed vs readiness:** AG C9 no certifica Git SHA, `.agents`, QA de UC ni estado `INTEGRATED_VERIFIED`.
10. **GitHub permissions:** `get_repo` muestra derechos de usuario, pero `create_branch` falla para la integración concreta; no inferir capacidad de escritura de metadata.

## 3. ADRs y decisiones humanas abiertas

| ADR PROPUESTO | Pregunta / alternativas | Recomendación | Quién aprueba / evidencia requerida |
|---|---|---|---|
| ADR-TCG-01 | `technology:query` vs `repository:query`/una `context` command | `technology:query` por version con action allowlist y `--json`; mantener TUI | TCG+PCX+AG, fixture CLI real |
| ADR-TCG-02 | version constraint semver/major | major exacto MVP, sin agregado mixto | TCG+AG+PCX, fixture 10/11 |
| ADR-TCG-03 | JSON Graphify vs parse textual | preferir formato estructurado probado; si no hay refs, status/warnings sin citas inventadas | TCG/Graphify, versión pinned/output samples |
| ADR-TCG-04 | TTL freshness | revalidate on request para context mandatory, TTL configurable corto solo en optional | TCG+PCX security/ops |
| ADR-TCG-05 | almacenar prompts y Graphify stdout | metadata-only default con opt-in explícito y TTL | TCG/security/GDPR counsel si aplica |
| ADR-TCG-06 | `--pull` que reconcilia divergencia | exigir consentimiento explícito antes de reescribir commits | TCG owner y usuario, backup tests |
| ADR-TCG-07 | multi-member graphHash | hash manifest canónico sobre ref member hashes, no string ad-hoc | TCG+AG/PCX contract reviewers |
| ADR-TCG-08 | re-scans de ACCEPTED y key collision | conservar identidad de accepted, collision resoluble por raíz | TCG owner, fixtures repetibles |
| ADR-TCG-09 | `EMPTY_GRAPH` | estado externo `MISSING/FAILED` reason EMPTY sin falso SKIPPED | TCG+PCX consumer |
| ADR-TCG-10 | formatos runtime `technology.json` v2 | compat lectura v2, extensión aditiva con schema bump solo incompatible | TCG+AG owner |
| ADR-TCG-11 | publicar docs con 403 | operador local autorizado o reparación de App integration, sin escribir en main | usuario/maintainer |
| ADR-TCG-12 | Consumer PCX port path y timeouts | localizar en su rama actual y negociar; no inventar REST | PCX owner F8 |

## 4. Operación Git efectivamente intentada

| Operación | Resultado |
|---|---|
| `get_repo charlietyn/tech-context-graph` | **OK**; público, defaultBranch `main`; metadata indicaba `push/admin` para actor |
| `branches?per_page=100` | **OK**; único branch remoto `main@6df893c24a332130a3e6f3585b21fb015d8f2023` en respuesta observada |
| `git/trees/main?recursive=1` | **OK**; árbol completo 265 entries, incluye `.agents/*` |
| `compare_commits` audit SHA→main | **OK**; ahead 6 commits/84 archivos |
| `fetch workflow run/job logs` | **OK**; comprobó fallos 5/11 |
| `create_branch('agents-total-integration',sha=...)` | **DENEGADO**: `403 Resource not accessible by integration` |
| Crear 11 archivos en GitHub | **NO INTENTADO**: branch no creada, no arriesgar default main |
| Commit/push/PR/merge GitHub | **NO HECHOS** |
| `git status`, `git diff --check` remoto/local | **NO DISPONIBLE**: sin checkout; local git DNS falló |
| Paquete de documentos en sandbox | **CREADO**; verificar tamaños y ZIP antes de entregar |

## 5. Instrucción de recuperación reproducible

```bash
# En equipo autorizado con acceso al repo, fuera del workspace TCG de usuario:
git clone https://github.com/charlietyn/tech-context-graph.git tcg-planning
cd tcg-planning
git fetch --all --prune
git status --short
git branch -avv
git worktree list
git rev-parse origin/main
# Si no existe la rama y el directorio está clean:
git switch -c agents-total-integration origin/main
# Copiar solo docs/agents-total-integration/ desde el ZIP entregado.
git diff --check
git status --short
git add docs/agents-total-integration
git diff --cached --check
git diff --cached --stat
git commit -m 'docs(tcg): audit and plan ARGEns v6 technology contracts'
git push -u origin agents-total-integration
```

Si la rama ya existe en GitHub al intentarlo, **no** ejecutar `-f`, `reset --hard` ni `push --force`; comparar, proteger contenido útil y acordar merge documental. No modificar `.agents` ni código hasta fase 3.

## 6. Estado de cierre honesto

- Auditoría remota fuente TCG y seam AG+PCX/DeepSeek: **REALIZADA de forma estática**, con límites documentados.
- Contratos/diseño/gaps/work packages/QA: **ELABORADOS COMO PLAN PROPUESTO**.
- Tests locales, Graphify real, validación CI de nuevos cambios, E2E KwikVet: **NO EJECUTADOS**.
- `agents-total-integration` en GitHub: **NO CREADA** por 403.
- Próximo acto operativo: **habilitar permiso de escritura o aplicar paquete manualmente**; no hacer merge ni implementación de producto desde este plan sin revisión.


---
