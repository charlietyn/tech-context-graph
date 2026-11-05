# 07 · GAP analysis: estado actual vs objetivo (estático, no ejecución)

**Baseline:** TCG `main@6df893c24a332130a3e6f3585b21fb015d8f2023`; fecha 2026-11-05. **Clasificación:** `REUSAR`, `REPARAR`, `EXTENDER`, `CREAR`, `RETIRAR_LEGACY`, `DEPENDER_DE_OTRO_REPO`, `DESCARTAR`. `AUSENTE-EN-ÁMBITO` significa que no se vio en el árbol y las rutas inspeccionadas; no prueba inexistencia universal.

| GAP | Ahora (evidencia) | Objetivo / clasificación | Prioridad / riesgo | WP / gate |
|---|---|---|---|---|
| G-01 Consulta solo TUI | `GraphifyCliService.query` existe y persiste stdout; `ConsoleUiService.queryFlow/pathFlow` `src/ui/console-ui.service.ts:L514-L539` | **EXTENDER** CLI read-only JSON V1; sin REST | P0 / consumidor no integrable | WP-01 F8 |
| G-02 Graphify stdout sin provenance tipado | `graphify-cli.service.ts:L277-L301` retorna `output:string` | **EXTENDER** refs respaldadas; no fabricar `file:line` | P0 / alucinación de evidencia | WP-01/02 |
| G-03 Estado source vs freshness | `repository-control.service.ts:L31-L83` usa cache + recalcula bajo demanda; `repository-state.ts:L3` | **EXTENDER** check on-demand y status consulta negociado | P1 / READY falso | WP-03 |
| G-04 Publicación inmuta por puntero | `graphify-cli.service.ts:L137-L174,L239-L262` digest+fingerprint+rename | **REUSAR**, añadir verificación antes y después de query | P0 / TOCTOU | WP-02/06 |
| G-05 Technology manifest v2 | `technology-graph.service.ts:L228-L246` versions/constraints, graph path | **REUSAR/EXTENDER** repoCommit/graphRefs y validación de versión | P1 / version mismatch | WP-02/05 |
| G-06 Agregado mezcla miembros | `technology-graph.service.ts:L102-L166` merge por family de READY | **EXTENDER** selector compatible, nunca family agregado para versión explícita | P0 / recomendaciones erróneas | WP-02 |
| G-07 Query logging indiscriminado | `repository-store.service.ts:L231-L236` guarda input/output; `graphify-cli.service.ts:L288-L300` llama siempre | **REPARAR** privacidad, TTL y desactivar contenido | P1 / exposición y DB growth | WP-04/06 |
| G-08 allowlist para CLI remoto | `src/commands/repository-control.commands.ts` solo comandos de administración | **CREAR** validación negocio de query, paths/args/limits | P0 / shell/path/secret leak | WP-04 |
| G-09 Graphify binary dependency | `runProcess('graphify',args)` y `package.json` sin Graphify dependency npm | **REUSAR** externo, version pin y mocks | P1 / CI/test drift | WP-06/07 |
| G-10 CI rojo Linux/Windows | Actions run 41943945018 logs, `quality.yml:L8-L37` | **REPARAR** fixtures independientes y smoke pinned | P0 antes de integración fuerte | WP-07 |
| G-11 Windows alias paths | `test/update-safety.spec.ts`, `test/repository-git.service.spec.ts` log fallo 8.3 | **REPARAR** realpath normalization comparado por OS | P1 / tests falso fallo | WP-07 |
| G-12 Label workspace Linux | `test/workspace-onboarding.service.spec.ts` contra rutas Windows (logs) | **REPARAR** fixtures/path semantics multiplataforma | P1 | WP-07 |
| G-13 Re-scan ACCEPTED | `.agents/technical-debt/risks.md:L7-L13`, `repository-store.service.ts:L301+` | **REPARAR** preservación manual, regression test | P1 / clasificación ambigua | WP-04 o paquete catálogo acotado |
| G-14 key colliding across roots | `.agents/technical-debt/risks.md:L15-L21` | **REPARAR** identidad estable y error parcial | P1 / pérdida lote | WP-04 |
| G-15 SQLite+FS no transacción común | `sqlite-database.service.ts:L59-L78,L116-L121`; `inspection-reconcile.service.ts:L24-L95` | **EXTENDER** recovery y scenario matrix | P1 / inconsistencia crash | WP-06 |
| G-16 Large graph JSON sync | `technology-graph.service.ts:L114-L165`, `.agents/technical-debt/risks.md:L99-L105` | **REPARAR/EXTENDER** memory limits y streaming futuro | P2 / OOM | WP-06 |
| G-17 Graphify output formatter fragile | `graphify-cli.service.ts:L51-L97,L188-L190` regex/help | **EXTENDER** compatibility/version fixtures | P1 / silent drift | WP-06/07 |
| G-18 `.agents` existente | `.agents/README.md:L3-L13`, `AGENTS.md:L3` nuevo a 5/11 | **REUSAR/EXTENDER** y no duplicar | P1 / instructions drift | WP-08 |
| G-19 AG integración parcial | AG `tech-context-graph.client.ts:L50-L145`; `tech-graph-context.ts:L11-L47` | **REUSAR/EXTENDER** vocabulario CT+TC tests | P1 / doble lectura incompatible | WP-05/09 |
| G-20 PCX adapter TCG | No path concreto confirmado; prompt X-03 PARCIAL | **DEPENDER_DE_OTRO_REPO** TechnologyKnowledgePort/adapter | P0 F8 / integración | WP-09 + PCX F8 |
| G-21 C6 drift AG↔PCX | AG `capabilities.ts:L42-L60`, PCX `contract.ts:L46-L59` | **DEPENDER_DE_OTRO_REPO** F0, no TCG | P0 / bloqueo global | PCX/AG CT-001 |
| G-22 DeepSeek runtime | solo referencia externa, TCG no ejecuta agents | **DESCARTAR** integrar DSH en TCG | P0 no introducir segundo scheduler | PCX F10 |
| G-23 Handoff `.agents` generated | AG/PCX owners, no TCG repo | **DEPENDER_DE_OTRO_REPO**, no manipular generated artifacts | P1 / ownership | AG/PCX F3–F5 |
| G-24 Source safety Git pull | `repository-git.service.ts:L102-L107` reconciliación posible, `--pull` flag `commands...:L77` | **REPARAR/DESACOPLAR** consent explicit para rewrite | P0 / pérdida historia Git | WP-04 / decisión humana |
| G-25 No standalone API HTTP/MCP TCG | `package.json`, DI commands, README `L69-L80` | **DESCARTAR** inventar endpoints, usar CLI | P0 boundary | WP-01 |
| G-26 config keys inert | `.agents/technical-debt/risks.md:L25-L39` | **REPARAR** conectar o retirar flags con migración compatible | P2 / false security | WP-04/06 |
| G-27 Retención/locks orphan | `.agents/technical-debt/risks.md:L42-L55,L95-L105` | **EXTENDER** prune/doctor y bounded logs | P2 / espacio/recovery | WP-06 |
| G-28 CLI no status/exit contract JSON universal | commands `--json` en list/reconcile, query no existe | **CREAR** tests CLI bin / parser exhaustivo | P1 / scripts frágiles | WP-01/07/09 |

## 1. Grados de evidencia por grupo

- **E-R:** clases, funciones, estados, `graphDigest`, tipado y ausencia del comando en árbol `src/commands` del commit. Esto no demuestra comportamiento de una instalación en producción.
- **E-CI:** logs del run `41943945018` confirman fallos concretos, no demuestran otros resultados no ejecutados aquí.
- **E-D:** `.agents/technical-debt/risks.md` marca sus propios hallazgos `[V]` (reproducción documentada) y `[L]` (lectura); se conserva su clasificación, se pide reproducirlos en checkout nuevo antes de corregir.
- **P:** TechnologyContextResult, CLI JSON, ports, política, fixtures, tests, F8. Nada de esto está implementado en este paquete.

## 2. Prioridades reales de ejecución

**P0 = seguridad y contrato:** permisos de publicación de docs; reconocer `.agents`; contrato CLI `CONTRACT-002`; verificación hashes/provenance; no Git rewriting sin consentimiento; CI de baseline para no enmascarar cambios.

**P1 = confiabilidad:** selección de versión y freshness, clasificación humana, sanitización/logs, producer/consumer fixtures AG+PCX, recuperación sin overwrite.

**P2 = DX/performance:** retención, config flags, normalizar graph paths, robustecer Graphify compatibility, documentación y smoke.

**No confundir GAP con vulnerabilidad explotada.** Por ejemplo, la ausencia del CLI de consulta es una capacidad pendiente, no una vulnerabilidad; en cambio el riesgo de `--pull` se documenta como superficie mutadora real y exige gate operativo.

## 3. Matriz de decisiones no resueltas

| Pregunta | Opción conservadora | Decisor |
|---|---|---|
| ¿Exponer TCG por REST/MCP? | **No**; CLI JSON ya encaja | owner TCG/PCX |
| ¿Graphify output estructurado disponible? | Validar binario real; no parsear stdout como fuentes verificadas | TCG/Graphify |
| ¿Permitir resultado STALE en pack? | Solo warning en contexto opcional, sin afirmación actual | PCX policy + TCG producer |
| ¿Version constraint semver/major exacto? | Empezar major exacto; no fallback al agregado | TCG/AG/PCX |
| ¿Desactivar logging completo de query? | metadata-only default | TCG owner/security |
| ¿`--pull` reescribe commits locales? | exigir consentimiento explícito para divergence | owner TCG/user |
| ¿Migrar `projects:` YAML legacy? | fuera de MVP; mantener hasta ADR de migración | owner TCG |

## 4. Comandos de comprobación futura, sin efectos en workspace real

```bash
# En clone TEMPORAL aislado, nunca el directorio del workspace del usuario.
git status --short
git branch -a
git worktree list
npm ci
npm run lint:types
npm test -- --runInBand
npm run build
node dist/main.js --help
# Tests read/write TCG requieren --workspace <temp> y TCG_CONFIG_HOME=<temp>.
```

**No usar:** `tcg repository:inspect --pull`, `git reset --hard`, `git clean`, `git push --force`, migraciones de SQLite en workspace real durante la auditoría.


---
