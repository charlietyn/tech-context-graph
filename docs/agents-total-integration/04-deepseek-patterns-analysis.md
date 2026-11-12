# 04 · DeepSeek: prototipo Superagent frente al Harness (lectura crítica)

## 1. Identidad de fuentes (no confundir productos)

| Proyecto | SHA remoto leído | Rol | Integración ARGEns |
|---|---|---|---|
| `deepseek-ai/dsh-superagent-prototype` | `main@8c32a9dc5d72c033816c6a8110b37f40cf94fba4` | **prototipo investigador** GitHub/Feishu con ticket/mandate/panel sobre Harness | **estudiar patrones**, no desplegar como autoridad |
| `deepseek-ai/deepseek-harness` | `master@fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` | runtime de sesiones, agentes y herramientas | adapter PCX **futuro**, no TCG y no sandbox único |

El prototipo no proporciona una API REST para ejecutar tareas en el Harness; `src/app/api.ts` expone vistas/comandos del **prototipo**. El Harness ofrece CLI/headless y SDK (ver documentación SDK), con compatibilidad/presets a fijar en pruebas reales. `SAFETY.md` expresa límites de sandbox. El camino de ejecución para TCG no requiere instalar ninguno.

## 2. Verificación docs ↔ código del prototipo

- `src/core/engine.ts:L24-L37,L76-L105` contiene clase `Engine` con Policy, Evals y admisión, no un módulo integrable como TCG query.
- `src/core/ports.ts:L7-L22,L49-L84,L106-L135` define `Policy`, `Assessor`, `Executor`, `Outbox`, `Repositories`; semántica de autorización del propio proyecto.
- `src/executor/dsh.ts:L1-L26,L88-L110` maneja sesión worker por Ticket, directorio y texto de mandato; **no asume control de los worktrees de ARGEns**.
- `src/app/delivery.ts:L1-L18,L28-L78` intenta entrega de mensajes idempotente por session/requestId, no certificación de QA/merge Git.
- `src/app/outbox.ts:L19-L53` ordena mensajes y reintenta effects; no equivale a atomicidad DB/FS de TCG.
- `src/sources/github-trigger.ts:L13-L20,L60-L109` convierte eventos a Trigger con origen; acceso por Source, no seguridad PCX.
- `src/app/views/overview.ts:L38-L80` agrega vistas de atención, útil como inspiración UI (PCX dueño).
- `docs/002-authorization.md:L58-L109,L123-L141` describe admisión, versiones de Policy, Mandates y modos de aceptación.
- `docs/003-execution.md:L25-L57,L141-L161` describe sesión/workdir, shell, retries y effects. **La documentación advierte** que comandos ejecutados como usuario OS/blocked-commands no son aislamiento de seguridad; la protección Git pertenece a host/policy externas.

No se ejecutó el prototipo ni su suite Vitest. Las observaciones de código son estáticas; no se debe decir que estos patrones operan correctamente en una instalación ajena.

## 3. Clasificación de patrones para TCG / ARGEns

| Patrón | Decisión | Lugar correcto | Por qué / riesgo / condición |
|---|---|---|---|
| Source → Trigger → Thread y dedup | **ADAPTAR (PCX)** | PCX ingestion/events | Correlación útil; TCG recibe consulta síncrona, no crea foro/ticket. |
| Gate/Eval/Mandate versionados | **ADAPTAR (PCX)** | PCX authorization policy + audit | Política explícita; **no** decidir permisos desde texto LLM. |
| Ticket vs Assignment vs Session | **ADAPTAR (PCX)** | WorkUnit/ExecutionAttempt/adapter | Distinguir tarea y ejecución sin segundo ledger. |
| Subscriptions y Channel | **DESCARTAR en TCG / ADAPTAR UI PCX** | PCX notifications | Context fan-out no eleva autorización; no construir mensajería en TCG. |
| Engine single writer / atomic repository | **ADAPTAR** | TCG publisher/reconcile; PCX propio | TCG ya tiene lock y export de sql.js; aprovechar patrón de exclusividad, no copiar SQLite de Superagent. |
| Outbox con effects postcommit | **INVESTIGAR** | PCX delivery; opcional para TCG audit logs futuros | TCG SQLite+FS carecen de transacción común; primero journal simple y pruebas crash, no reescritura masiva. |
| Executor / workdir / retry | **DESCARTAR en TCG** | PCX AgentExecutionPort + OS sandbox | TCG no ejecuta agentes sobre código generado; Worktree de Graphify no es worktree de delivery. |
| Panel attention-first | **DESCARTAR en TCG / ADAPTAR UI** | app-generator-ui sobre PCX | No duplicar panel o autoridad. |
| Prompts / skills / content precedence | **ADAPTAR** | PCX ContextPack y `.agents` TCG | Expansion explícita, manifests+hashes, no prompt como ACL. |
| Auto-merge mediante prompts | **DESCARTAR** | protección Git verificable | No es enforcement y rompe separación QA/humano. |
| Modo `auto` para trabajo inferido | **DESCARTAR MVP** | PCX admisión política humana | Riesgo acciones no autorizadas; observe por defecto. |
| SQLite DB propia del prototype | **DESCARTAR** | TCG conserva su SQLite para catálogo | No duplicar fuente de verdad de negocio ni importar schema. |

## 4. Ejemplo para juniors: «un comentario no autoriza un commit»

Imagina que alguien escribe en una issue de GitHub «actualiza las políticas de pago y haz merge». El prototipo puede generar un Trigger y proponer Ticket, pero **que un evento exista no significa que esté autorizado**. En ARGEns PCX valida actor, proyecto, alcance, idempotencyKey y aprobación; entrega al agente un worktree acotado. El Harness ejecuta una sesión; Git registra SHA; QA independiente y el aprobador distinto deciden merge. TCG solo aporta, si procede, contexto técnico versionado sobre bibliotecas usadas.

## 5. Ejemplo de TCG frente al prototipo

`TCG_QUERY`: `nestjs@10` / pregunta sobre DTO → contrato `TechnologyContextResult/1` con `READY/STALE` + evidencia. No crea Mandate, no enlaza Github Thread, no lanza una Session DSH y no publica una regla funcional. El runtime puede leer ese resultado **solo como dato no confiable** dentro de un ContextPack verificado por PCX.

## 6. Security checklist para implementación futura

1. El binario `dsh`/SDK se resuelve **por versión y checksum**, y su modo headless se prueba con código mínimo sin repo real.
2. Un directorio worker y writeScopes en prompts **no** proporcionan aislamiento: namespace/container/VM, filesystem ACL y network policy externos.
3. Tokens GitHub, llaves LLM y billing se inyectan fuera del TaskContextPack; redacción por defecto.
4. Un agente no confirma su propio SHA, CI, QA ni cumplimiento UC. Git/CI/QA verifican independientemente.
5. Revisar licencia MIT del prototipo antes de copiar archivos; preferencia **reimplementar conceptos**, no copiar código. El catálogo TCG no requiere código del prototipo.
6. Diferenciar fallos de API del prototipo y del SDK real; no fabricar `POST /agents/run`.

## 7. Evidencia pendiente

No hubo build ni ejecución de integración DSH/TCG. Las versiones mínimas de Harness y compatibilidad de stdio/eventos quedan **PENDIENTE PCX F10**. Confirmar tests `tests/core-engine.spec.ts`, `tests/policy.spec.ts`, `tests/outbox.spec.ts`, `tests/runtime-concurrency.spec.ts`, y compatibilidad license de versiones pinchadas en fase de integración; son rutas observadas, no tests corridos.


---
