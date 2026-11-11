# Integraciones

Todas son **subprocesos locales**. La aplicación en sí no abre conexiones de red; solo `git pull` y lo que Graphify haga por su cuenta.

## Graphify (obligatorio para inspeccionar)

- **Paquete:** `graphifyy` en PyPI, ejecutable `graphify`. Instalación: `uv tool install graphifyy`. Versión fijada para contratos y smoke real: **0.9.105** (desde 2026-11-11; 0.9.102 da el mismo digest en el smoke). No hay versión mínima declarada en `package.json`: el contrato compara la versión viva con la de cada publicación y devuelve STALE si difiere.
- **Código:** `src/services/graphify-cli.service.ts`, `src/services/technology-graph.service.ts`. El nombre `graphify` está fijo; `graphify.executable` no se usa aquí.

### Contrato de invocación

| Comando | Timeout | Uso |
|---|---|---|
| `graphify --version` | 10 s | Disponibilidad, caché de 60 s |
| `graphify --help` | 15 s | Detecta `incremental`, `--out`, `--max-workers` por regex |
| `graphify extract <src> --code-only --out <gen> [--exclude p]... [--force] [--no-cluster] [--max-workers 2]` | 30 min | Extracción |
| `graphify query\|explain <input> --graph <path>` | 120 s | Consulta |
| `graphify path <a> <b> --graph <path>` | 120 s | Camino |
| `graphify merge-graphs <grafos...> --out <tmp>` | 30 min | Agregado |

### Contrato de salida

| Esperado | Dónde se usa |
|---|---|
| Fichero en `<out>/graphify-out/graph.json` | `resolveGraphPath`; también acepta `<out>/graph.json` |
| Línea `graph.json: N nodes, M edges, K communities` | `graphSummaryFromLine` |
| Línea `AST extraction: x / y (z%)` | `graphifyProgressFromLine` |
| stderr `graph is empty` | `EMPTY_GRAPH` |
| Salida `MemoryError` o `BrokenProcessPool` | Reintento con menos workers |
| `warning`, `zero nodes`, `failed to parse` | Avisos al usuario |

**Actualizar Graphify cambia la versión y, por tanto, el hash de configuración: re-extrae todo en la siguiente actualización.** Cambios de formato en estas líneas degradan sin error: desaparecen progreso y comunidades. Comprueba con `scripts/verify-update.cjs`.

### Entorno

`spawnGraphify` pasa `scopedGitEnvironment(args[1])` para que los Git internos confíen en esa raíz sin configuración global.

## Git (obligatorio con `--pull` y para repositorios Git)

- **Código:** `git-access.ts`, `repository-git.service.ts`, `repository-exclusions.ts`, `repository-fingerprint.service.ts`.
- Credenciales: del usuario, nunca interactivas (`GIT_TERMINAL_PROMPT=0`). Sin credenciales válidas da `AUTHENTICATION`.
- `classifyGitError` asume mensajes en **inglés**; con otra locale puede dar `GIT_FAILED`.

## ripgrep `rg` (opcional)

`estimateTrackedFiles` cuenta ficheros para omitir clustering a partir de 10 000. Si no está, se ignora y Graphify decide con clustering activado.

## Python y uv

Solo como requisitos de Graphify. `doctor` comprueba `python` (`python3` fuera de Windows). `scripts/install-windows.ps1` y `scripts/install-linux.sh` instalan `uv` y Graphify con perfiles `minimal`, `recommended`, `all`.

## MCP y LLM

**TCG no implementa servidor MCP** ni llama a LLM. Graphify los ofrece aparte (`docs/en/14-ai-and-mcp.md`). Las inspecciones son `--code-only`. Las claves `security.allow_external_llm` y `graphify.semantic` son hoy declarativas.

## Librerías relevantes

| Paquete | Particularidad |
|---|---|
| `sql.js` | WASM; requiere localizar el `.wasm` |
| `@clack/prompts` | Solo ESM; import dinámico |
| `nest-commander` | Sobre commander; ver trampa de `--no-*` |

## ARGEns v6 TCG producer CONTRACT-002

Entrada versionada (experimental en `agents-total-integration`): `tcg technology:query --json --technology nestjs --version 10 --question ...`. Contrato formal `docs/contracts/technology-context-result.v1.schema.json`; fixtures producer en `test/fixtures/contracts/technology-context/v1/`. PCX/AG consumen por proceso sin importar clases internas. No existe una API REST ni autorización multi-tenant en TCG. PCX valida contratos, autoriza workspace, interpreta `STALE|MISSING|FAILED` según política y no sustituye AC/UC por evidencia tecnológica. DeepSeek solo ejecutor bajo PCX, nunca dueño del grafo.

**C1 (plan 28 PCX, 2026-11-11):** READY exige commit Git limpio dentro de la ruta de la fuente (`assertReadyProvenance` en `technology-query.service.ts`); sin Git ⇒ FAILED/INTEGRITY_FAILED, cambios sin commit ⇒ STALE/SOURCE_CHANGED. **C2:** TCG no traduce ids ni versiones; PCX pide `framework`+`frameworkVersion` del C6 (vite 8, nuxt 4…). Tabla y diferencias de ids en `docs/en/technology-contract-v1.md`.

## CONTRACT-003 — referencia común de grafo

`tcg technology:reference --technology <id> --version <mayor> --json` → `TechnologyGraphReferenceV1` (`src/models/technology-graph-reference.ts`, esquema `docs/contracts/technology-graph-reference.v1.schema.json`, fixtures `test/fixtures/contracts/technology-graph-reference/v1/`). Mismas comprobaciones que la query, sin ejecutar Graphify. `graphSha256` = `sha256:` + `graphHash` de la publicación **core** (no del agregado que DBIG hashea hoy). PCX la guarda en el TaskContextPack; DBIG la sella en `architecture.lock`. Ninguno importa código TCG. Grafos de las versiones de C6: `scripts/technology-graph-targets.v1.json` + `scripts/build-technology-graphs.cjs`.
