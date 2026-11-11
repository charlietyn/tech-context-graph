# ARGEns v6 — TCG · Resultado de los planes TCG-1/2/3, plan 28 C1/C2 y grafos de C6 (2026-11-11)

Ejecución del [plan 13](13-plan-ejecutable-contrato-tecnologico-y-validacion-local-2026-11-10.md), de las tareas **C1/C2 del plan 28 de PCX** y de las tres peticiones del traspaso DBIG 26 (referencia común, C1/C2, grafos de las versiones de C6). Rama `agents-total-integration`; `main` sin tocar; sin merges ni push. Solo se escribió en TCG; PCX, DBIG y UI solo se leyeron.

**Código certificado: `af13162a81881c00e1b5f32b6e76130cbf727c2f`.** Evidencia: [`evidence/local/tcg/af13162…/`](evidence/local/tcg/af13162a81881c00e1b5f32b6e76130cbf727c2f/). Entorno: WSL2 Ubuntu (kernel 5.15.167.4), i7-11800H 16 hilos, 31 GiB, Node v24.20.0, npm 12.0.2, Python 3.12.3, uv 0.13.7, `graphify 0.9.105` (0.9.102 verificado aparte en un venv aislado).

## Veredicto

| Plan | Estado | Motivo |
|---|---|---|
| **TCG-1** Graphify real, CLI, consultas, estados | **LOCAL_PASS (Linux/WSL2)** · Windows nativo pendiente | Puertas verdes, smoke real con CLI compilado, 9 cores reales READY. Falta TCG-05 en Windows nativo. |
| **TCG-2** Contratos, versiones, provenance, PCX/DBIG | **PRODUCER_PASS · CONSUMER_MISSING** | C1, C2 y CONTRACT-003 implementados y probados en TCG. PCX y DBIG todavía no consumen la salida real (ver incompatibilidades). |
| **TCG-3** Seguridad, recuperación, rendimiento, CI | **PARTIAL** | Rendimiento medido con repos reales; seguridad y recuperación con cobertura existente + nuevas pruebas de mapeo de fallos. CI remoto **N/A** por decisión del propietario; certificación local. Sin pruebas nuevas de crash. |

Nada de esto autoriza WorkUnits, AC ni agentes: TCG solo informa.

## Commits

| SHA | Contenido |
|---|---|
| `f24ae66` | C1 (READY exige commit Git limpio), CONTRACT-003 `technology:reference`, LOCKED reintentable, esquemas, fixtures y tests |
| `e3d6c3c` | Smoke real por CLI, `build-technology-graphs.cjs` + manifiesto fijado, perfil ignore `vite`, fix `project:add --json`, workflows manuales, pin 0.9.105 |
| `af13162` | Documentación EN/ES y `.agents` |
| (este commit) | Este informe, evidencia, objetivo `nestjs-core-10`, riesgos R-21/R-22 |

## Archivos

- **Nuevos:** `src/models/technology-graph-reference.ts`, `docs/contracts/technology-graph-reference.v1.schema.json`, `docs/en/technology-graph-reference-v1.md`, `scripts/build-technology-graphs.cjs`, `scripts/technology-graph-targets.v1.json`, `ignore/vite.graphifyignore`, `test/technology-graph-reference.spec.ts`, `test/fixtures/contracts/technology-graph-reference/v1/*`, `test/fixtures/contracts/technology-context/v1/real/*`.
- **Modificados:** `src/services/{technology-query,published-graph-resolver,repository-fingerprint}.service.ts`, `src/commands/{technology-query,project}.commands.ts`, `src/cli.module.ts`, `docs/contracts/technology-context-result.v1.schema.json`, `scripts/smoke-graphify-real.cjs`, `.github/workflows/*.yml`, `.gitignore`, `CHANGELOG.md`, `docs/{en,es}/*contract*`, `.agents/{integrations,cli,features,testing,technical-debt}/*`, tests existentes de query/resolver/schema/discovery, fixture `ready.json`.

## Resultado real de Graphify

- `graphify --version` → `graphify 0.9.105` (global, el mismo que usa PCX A5). `graphifyy==0.9.102` y `0.9.105` instalados en venvs aislados: el smoke da **digests idénticos** en ambos (`43d6b909…` para el core 10 sintético, `a095882a…` para el 11), por eso el pin pasa a **0.9.105** sin tocar la instalación del usuario.
- `scripts/smoke-graphify-real.cjs` (CLI compilado, fuentes Git temporales con commits deterministas, `GRAPHIFY_BACKEND=none`): **PASS** en `af13162`. Cubre nestjs 10+11 sin mezcla, `query`/`explain`/`path` READY, mayor inexistente → MISSING (4), `--revision` distinta → STALE (3), fuente con cambios sin commit → STALE `SOURCE_CHANGED`, fuente sin Git → FAILED `INTEGRITY_FAILED`, Graphify fuera de PATH → FAILED `GRAPHIFY_UNAVAILABLE`, versión `^11` → FAILED `INVALID_INPUT`, commit nuevo tras READY → STALE sin `matches` ni `sourceRefs`. Cada salida se valida con Ajv contra CONTRACT-002 y CONTRACT-003, y stdout es exactamente un objeto JSON.
- Limitación observada: Graphify sale con código 3 cuando un nombre es ambiguo (`SpringApplication` = clase y constructor). TCG responde FAILED `QUERY_FAILED` sin contenido; con el id de nodo completo responde READY. Registrado como R-22.
- La salida de Graphify es texto no estructurado: TCG la marca `INDEX`, la sanea y no inventa `fileRef`/`lineStart` aunque `explain` imprima `Source: … L48`.

## Certificación de versiones (grafos de las versiones que anuncia DBIG C6)

Construidos con `scripts/build-technology-graphs.cjs` sobre clones superficiales **fijados por commit** de los tags upstream (las copias locales de `D:\Programacion\…\Tech` no se usaron: `nest` está en 12.3.2, `spring-boot` en 4.2.0-SNAPSHOT, `laravel/12|13` es el esqueleto `laravel/laravel`, y no hay fuente de Vite). Cada fila: `project:add --kind core` → `repository:inspect` → `technology:reference` READY con el commit fijado → `query` y `explain` READY con el mismo digest → mayor+100 MISSING/VERSION_MISMATCH. Versión comprobada en la propia fuente (`package.json`, `Application::VERSION`, `gradle.properties`, tag).

| Core | Upstream ref → commit | Archivos | Extracción en frío | Nodos / aristas | Grafo | graphSha256 | query / explain |
|---|---|---|---|---|---|---|---|
| `vite@8` → 8.3.7 | `v8.3.7` → `5def936009` | 2928 | 8.9 s | 4,512 / 10,094 | 3.9 MB | `7831cb937241…` | 792 / 655 ms |
| `nuxt@4` → 4.6.4 | `v4.6.4` → `b9a6b68701` | 2495 | 11.0 s | 6,634 / 15,263 | 5.5 MB | `bf31483a3ade…` | 840 / 784 ms |
| `nestjs@11` → 11.2.9 | `v11.2.9` → `c6cf340d07` | 2180 | 19.0 s | 13,240 / 28,743 | 12.0 MB | `6afb34168b82…` | 1423 / 1246 ms |
| `nestjs@10` → 10.4.22 | `v10.4.22` → `e88b270cb5` | 2048 | 18.3 s | 12,202 / 26,365 | 11.0 MB | `6b813687aa23…` | 1440 / 1307 ms |
| `laravel@12` → 12.72.0 | `v12.72.0` → `b089d3020e` | 3125 | 14.0 s | 21,846 / 42,978 | 18.9 MB | `472909094bdb…` | 2013 / 1807 ms |
| `laravel@13` → 13.42.0 | `v13.42.0` → `f5c01f6b63` | 3507 | 20.5 s | 24,013 / 47,778 | 20.9 MB | `dfa78dd9a7ec…` | 2181 / 1967 ms |
| `spring-boot@3` → 3.5.16 (`spring-boot-project/`) | `v3.5.16` → `0566f69330` | 9113 | 43.3 s | 40,170 / 117,356 | 78.8 MB | `197316669ff7…` | 5881 / 5303 ms |
| `flutter@3` → 3.47.9 (`packages/flutter`) | `3.47.9` → `c197ca5199` | 1820 | 18.3 s | 42,301 / 58,429 | 23.9 MB | `d247448a9ba7…` | 2805 / 2531 ms |
| `expo@52` → 52.0.49 (`packages/`) | `sdk-52` → `d516432a62` | 12887 | 139.5 s | 63,944 / 143,706 | 70.4 MB | `1f2f35bfbca5…` | 7170 / 5435 ms |

- `nestjs@10` y `nestjs@11` conviven en el mismo workspace con digests distintos; ninguna consulta mezcla cores (TCG-06 con código real).
- **Reproducibilidad:** `nestjs-core-11` se construyó dos veces en workspaces distintos y dio el mismo `sha256:6afb3416…`.
- Alcance: Flutter = framework Dart (sin el motor C++), Expo = `packages/` del SDK 52, Spring Boot = `spring-boot-project/`. El resto, repositorio completo. Extracción code-only: sin semántica de documentación.
- Los grafos viven en un workspace temporal de esta sesión, no en Git. Para tenerlos en un workspace persistente, ver "Comandos".
- La latencia de consulta (hasta ~7 s en Expo) está dentro del timeout de 30 s que usa PCX. No hay presupuestos de rendimiento acordados: estas cifras son medición, no puerta.

## Contratos consumibles por PCX

1. **CONTRACT-002 `technology:query` 1.0** (sin cambio de versión). C1 aplicado en el productor: todo READY lleva `freshnessCheckedAt` y `repositoryCommit` Git no nulo en cada sourceRef; el esquema lo exige en la rama READY. Compatible con el `admitTechnologyContext` actual de PCX (su zod acepta un superconjunto).
2. **C2 — mapeo de versión:** TCG no traduce. PCX debe pedir `--technology <framework> --version <frameworkVersion>` (`vite 8`, `nuxt 4`) y, si no hay framework, `--technology <id TCG> --version <technologyVersion numérica>`. Tabla completa e ids que difieren (`springboot`→`spring-boot`, `react-native`/expo→`expo`) en [`docs/en/technology-contract-v1.md`](../en/technology-contract-v1.md).
3. **CONTRACT-003 `TechnologyGraphReferenceV1`** para guardar en el TaskContextPack (`technologyGraphReferenceFromResult`) y reproducir con `--revision <hex>`.
4. Fixtures productor: `test/fixtures/contracts/technology-context/v1/real/` (salidas reales del CLI) y `…/technology-graph-reference/v1/` (incluye `real-ready.json`). PCX debe copiar el esquema 1.0 actualizado a `tests/fixtures/argens-v6-tcg/` y fijar el SHA nuevo en su `PROVENANCE.json`.

## Contratos consumibles por DBIG

- **CONTRACT-003** vía `tcg technology:reference --workspace <confiable> --technology <id TCG> --version <mayor> --json`. Sellar el objeto tal cual en `architecture.lock` cuando sea READY; verificar después con `--revision <bareGraphDigest(graphSha256)>`. `graphSha256` usa el mismo formato `sha256:<hex>` que `VerifiedTechGraphReference`, y `publishedAt` sustituye a `generatedAt`.
- DBIG **no** debe seguir hasheando `graph.json` bajo `TECH_GRAPHS_ROOT`: ese digest es de un agregado o un layout heredado, no de una publicación verificada, y nunca coincidirá con TCG.
- Sin import de código entre repositorios: solo JSON por proceso con argv, timeout y límite de salida.

## Pruebas realizadas

| Puerta | Comando | Resultado en `af13162` |
|---|---|---|
| Instalación | `npm ci` | 0 |
| Tipos | `npm run lint:types` | 0 |
| Unit/integración | `npm test` | **158/158**, 28 suites (baseline `cc313cb`: 131/131, 27) |
| Build | `npm run build` | 0 |
| CLI contrato | `node scripts/smoke-technology-contract.cjs` | PASS |
| Graphify | `graphify --version` | `graphify 0.9.105` |
| Graphify real | `GRAPHIFY_BACKEND=none node scripts/smoke-graphify-real.cjs` | PASS (0.9.105 y 0.9.102) |
| Grafos C6 | `node scripts/build-technology-graphs.cjs …` | 9/9 PASS |

Nuevas pruebas: compuerta C1 (sin commit, sucio, READY con commit), CONTRACT-003 (esquema, proyección, degradación de READY incoherente, referencia fijada STALE, sin ejecutar Graphify), `describe()` con Git real y subárbol de monorepo, mapeo `TIMEOUT`/`OUTPUT_LIMIT`/`PROCESS_START`/salida no cero → FAILED tipado sin rutas, inyección de prompt tratada como dato `INDEX` saneado, workspace `LOCKED` reintentable, Vue SPA con Vite sigue clasificada como `vue`, salidas reales del CLI validadas por esquema y sin rutas locales.

Negativas y recuperación: las del smoke real (arriba) más las existentes de publicación (`graph-publication.spec.ts`: grafo corrupto, JSON inválido, publicación interrumpida, fuente cambiada antes de publicar), resolver (traversal, puntero falsificado, digest editado) y procesos (`update-safety.spec.ts`: timeout, cancelación, locks).

## Estado por WP

| WP | Estado | Nota |
|---|---|---|
| TCG-01 | PASS | `versions.json`; pin 0.9.105 |
| TCG-02 | PASS | puertas verdes; MISSING exit 4 en el smoke real |
| TCG-03 | PASS | READY → STALE tras commit; digests reproducibles |
| TCG-04 | PASS | 3 verbos reales; TIMEOUT/OUTPUT_LIMIT/arranque/salida≠0 con Graphify simulado en unit (separado del real) |
| TCG-05 | **PENDING** | Sin ejecución en Windows nativo; rutas con espacios/junctions no probadas en esta ronda |
| TCG-06 | PASS | nestjs 10.4.22 y 11.2.9 reales en el mismo workspace |
| TCG-07 | PASS | esquemas + fixtures reales + Ajv |
| TCG-08 | PASS | digest, puntero, fingerprint, commit, versión de Graphify; sucio ⇒ STALE |
| TCG-09 | PASS (productor) · CONSUMER_MISSING | mapeo explícito a `VerifiedTechGraphReference`; DBIG no lo consume aún |
| TCG-10 | PARTIAL | adaptador de PCX existe (A2) pero solo se probó con salidas simuladas; sin ejecución PCX→TCG real |
| TCG-11 | PASS | `SOURCE` nunca emitido; sin file/line inventados |
| TCG-12 | PASS | esquema 2.0, digest ajeno, revisión distinta, dos cores misma mayor, `^11` rechazados |
| TCG-13 | PASS (existente) | `shell:false`, límites, kill; no se midió "0 escrituras fuera de `.tcg`" |
| TCG-14 | PARTIAL | cobertura existente; sin pruebas nuevas de crash entre rename y publicación |
| TCG-15 | PARTIAL | contención de rutas cubierta; sin pruebas nuevas de junction/symlink |
| TCG-16 | PASS (medición) | tabla de arriba; sin presupuestos acordados |
| TCG-17 | N/A | el propietario no usa GitHub Actions; workflows solo manuales; certificación local por SHA |
| TCG-18 | PASS | EN/ES, `.agents`, CHANGELOG. Sin PR draft (push no autorizado) |

## Incompatibilidades entre repositorios

1. **PCX: test de versión obsoleto.** `tests/typescript/argens-v6-tcg-query.spec.ts` espera `tcgVersionFor('spa','8') === '3'`, pero su fixture C6 ya publica `frameworkVersion: '8'` (Vite). Por lectura estática ese test falla; no se ejecutó la suite de PCX.
2. **PCX: tecnología pedida.** `queryTechnology` recibe `technology` del llamador y sus tests usan `vue 3`; DBIG ya no anuncia Vue 3 sino `vite 8` y `nuxt 4`. PCX debe pasar `profile.framework` como `--technology`.
3. **PCX: C1 sin activar.** `requireRepositoryCommit` es opcional; con TCG en `af13162` puede ponerse a `true`. La copia del esquema en `tests/fixtures/argens-v6-tcg/` y su `PROVENANCE.json` siguen en `cc313cb`.
4. **DBIG: Expo sin versión numérica.** C6 publica `react-native` con versión `expo` y sin `frameworkVersion`, aunque emite Expo SDK 52 ⇒ PCX obtiene `TCG_VERSION_UNMAPPABLE`. DBIG debería publicar `framework: 'expo'`, `frameworkVersion: '52'`.
5. **Ids distintos:** DBIG `springboot` vs TCG `spring-boot`; DBIG `react-native` vs TCG `expo`; directorios heredados `nest` vs `nestjs`. Nadie traduce automáticamente: el mapeo vive en el consumidor (tabla en el contrato).
6. **DBIG: digest de otro artefacto.** `verifyExternalTechGraph` hashea el `graph.json` agregado bajo `TECH_GRAPHS_ROOT` y usa la fecha del agregado o el mtime; no tiene llamadores en `src/`. CONTRACT-003 lo sustituye.
7. **Workspace TCG existente en Windows** (`D:\Proyectos\Grapify\tech-context-graph`): `nuxt`, `spring-boot` y `flutter` están registrados como `core-unknown` (sin versión) y las fuentes locales no son las versiones de C6 ⇒ cualquier consulta v1 devuelve MISSING. Hay que registrar cores versionados (o usar el workspace que construye el script).
8. **Lecturas bloqueadas durante inspecciones (R-21):** una consulta de PCX mientras TCG inspecciona devuelve FAILED reintentable; PCX hoy no reintenta.

## UI (solo análisis, sin cambios)

La UI (`app-generator-ui`, Nuxt) solo consume la API de PCX y hoy no muestra estado tecnológico. Recomendación para cuando PCX lo exponga: mostrar la decisión de PCX (`USABLE`/`DEGRADED`/`BLOCKED`) como estado principal y el estado TCG (`READY`/`STALE`/`MISSING`/`FAILED`) como detalle, con los `reasons` de PCX, `resolvedVersion`, el commit corto y los primeros 12 caracteres de `graphSha256`. `STALE` nunca con estilo de éxito; `retryable: true` ⇒ acción "Reintentar"; `MISSING`/`VERSION_MISMATCH` ⇒ "sin grafo para esta versión"; nunca un botón que autorice agentes a partir de un READY de TCG.

## Problemas pendientes

- Windows nativo (TCG-05) y crash/junction nuevos (TCG-14/15).
- Consumo real: PCX (incompatibilidades 1–3, consulta real `vite 8`/`nuxt 4` contra un workspace TCG) y DBIG (sellar CONTRACT-003, incompatibilidades 4–6). Hasta entonces TCG-2 es `CONSUMER_MISSING`.
- Lectura sin lock exclusivo (R-21) y desambiguación de nodos de Graphify (R-22).
- Grafos en un workspace persistente elegido por el propietario (hoy en un temporal de la sesión).

## Comandos exactos de validación local

```bash
cd ~/projects/argens/tech-context-graph && git switch agents-total-integration && git rev-parse HEAD
node --version && npm --version && python3 --version && uv --version
npm ci && npm run lint:types && npm test && npm run build
node scripts/smoke-technology-contract.cjs
uv tool install 'graphifyy==0.9.105'      # o un venv aislado delante del PATH
graphify --version
GRAPHIFY_BACKEND=none node scripts/smoke-graphify-real.cjs   # escribe ci-evidence/ (ignorado)

# Grafos de C6 en un workspace NUEVO y explícito (nunca el checkout ni un workspace de usuario)
export TCG_CONFIG_HOME=$(mktemp -d) WS=~/tcg-technology-graphs SRC=~/tcg-technology-sources
node scripts/build-technology-graphs.cjs --workspace "$WS" --sources "$SRC" --evidence /tmp/tcg-build.json
node dist/main.js technology:reference --workspace "$WS" --technology vite --version 8 --json; echo "exit=$?"
node dist/main.js technology:query --workspace "$WS" --technology nuxt --version 4 \
  --action query --question "How does defineNuxtConfig work?" --json; echo "exit=$?"
# Códigos: 0 READY · 3 STALE · 4 MISSING · 2 FAILED
```
