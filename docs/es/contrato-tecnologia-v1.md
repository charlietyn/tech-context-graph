# CONTRACT-002 — Consulta de tecnologías versionadas (v1)

La CLI de **TCG es productora de conocimiento de solo lectura**. PCX mantiene autoridad sobre casos de uso, permisos, agentes, Git, QA y aprobaciones.

## Uso

    tcg technology:query --workspace "/workspaces/tech" --technology nestjs --version 10 --action query --question "¿Dónde se validan los DTO?" --json
    tcg technology:query --workspace "/workspaces/tech" --technology nestjs --version 10 --action path --question "Node A" --to "Node B"

Se exige un workspace existente, exactamente un repositorio **core** aprobado cuya versión coincida, inspección READY con puntero de publicación schema 2 y Graphify instalado.

## Protocolo

- Único objeto JSON por stdout: TechnologyContextResultV1, schemaVersion "1.0", status READY/STALE/MISSING/FAILED, sourceRefs, matches, warnings, duración y error tipado.
- Códigos de salida: 0 READY, 3 STALE, 4 MISSING, 2 FAILED.
- --version expresa versión real del framework (10, 10.4), no versión del contrato ni de Graphify.
- --revision fija digest SHA-256 de 64 caracteres; nunca se ignora el pin incorrecto.
- --max-results admite 1..20, pero la salida de texto libre de Graphify se representa **solo como un match INDEX**, limitado a 64 KiB, sin atribuir ficheros o líneas inventadas.

## Seguridad y procedencia

Se incluyen ID, clave, commit Git (nunca null en READY), sourceFingerprint, graphDigestSha256, graphifyVersion, publishedAt e inspectionId. Se verifica integridad y frescura antes y después de consultar Graphify. No se realizan Git pull, descarga, extracción o modificación de código como efecto colateral.

La primera versión selecciona un core único: compatibilidad de librerías y composición multiversión quedan pendientes de certificación con los consumidores. El texto de Graphify es dato no confiable, nunca instrucciones o reglas de negocio aprobadas.

Las consultas legacy del TUI solo almacenan texto si graphify.query_log_disabled es false explícitamente; queryPublished no registra consultas. PCX debe autorizar al usuario/tenant, workspace, presupuesto y fuente de confianza.

Alta manual de un core versionado:

    tcg project:add core-10 /ruta/framework --workspace /ruta/workspace --type technology --category backend --technology nestjs --kind core --technology-version 10.4.1

Posteriormente `repository:inspect core-10` para publicar el grafo. La consulta no registra ni inspecciona fuentes automáticamente.

READY exige también que la versión instalada de Graphify coincida exactamente con la registrada al publicar el grafo; tras actualizar Graphify corresponde re-inspeccionar, no consultar silenciosamente índices potencialmente incompatibles.

El selector v1 **no implementa rangos semver**: pedir prefijo numérico exacto `10`, `10.4` o `10.4.1`; `^10`, `~10`, `latest` son INVALID_INPUT. Core ambiguo o desconocido nunca se resuelve mediante agregados multiversión.

TCG fija `GRAPHIFY_QUERY_LOG_DISABLE=1` en todos los subprocesos Graphify `query/explain/path`: Graphify dispone de un segundo log global ajeno a SQLite, que se desactiva incluso si el historial de TCG se configura por opt-in. La persistencia local opt-in queda acotada y caduca.

La integración Graphify real (`scripts/smoke-graphify-real.cjs`) usa el CLI compilado contra fuentes Git temporales, code-only: cores nestjs 10 y 11 a la vez, query/explain/path READY, mayor incorrecta MISSING, revisión fijada STALE, fuente con cambios sin commit STALE, fuente sin Git FAILED, Graphify ausente FAILED y commit nuevo tras READY STALE. Cada salida se valida con Ajv contra ambos esquemas. El pin es `graphifyy==0.9.105` desde 2026-11-11 (0.9.102 y 0.9.105 dan el mismo digest en el grafo del smoke). Local: `GRAPHIFY_BACKEND=none node scripts/smoke-graphify-real.cjs`.

## READY reproducible (plan 28 C1, 2026-11-11)

Un READY siempre lleva `freshnessCheckedAt` y un `repositoryCommit` Git no nulo en cada sourceRef. La fuente debe ser un repositorio Git con el árbol limpio dentro de la ruta registrada (un miembro de monorepo se juzga por su subárbol):

| Fuente al consultar | Estado | Salida | Código |
|---|---|---|---|
| Git limpio, fingerprint igual a la publicación | READY | 0 | — |
| Git con cambios sin commit ya presentes al publicar | STALE | 3 | SOURCE_CHANGED (hacer commit y re-inspeccionar) |
| Git cambiado desde la publicación | STALE | 3 | STALE_GRAPH |
| Sin Git | FAILED | 2 | INTEGRITY_FAILED |

El esquema sigue en `schemaVersion: "1.0"`: la regla solo restringe lo que emite el productor; todo READY que puede emitir ya era válido para los consumidores del 1.0 anterior.

## Mapeo de versión de framework (plan 28 C2)

`--technology` es un id del catálogo TCG y `--version` la mayor del core de **esa** tecnología. PCX deriva el par del C6 de DBIG: `framework` + `frameworkVersion` si el perfil nombra framework; si no, el target + `technologyVersion` numérica. TCG no traduce ids ni versiones.

| DBIG C6 | Pedir a TCG | Core construido |
|---|---|---|
| vue `vue-spa-admin` (vite, 8) | `--technology vite --version 8` | vite 8.3.7 |
| vue `vue-nuxt-*` (nuxt, 4) | `--technology nuxt --version 4` | nuxt 4.6.4 |
| nestjs 11 | `nestjs 11` | @nestjs/core 11.2.9 |
| laravel 12 / 13 | `laravel 12` / `13` | laravel/framework 12.72.0 / 13.42.0 |
| springboot 3 | `spring-boot 3` (id distinto al target DBIG) | spring-boot 3.5.16 |
| flutter 3 | `flutter 3` | flutter 3.47.9 (`packages/flutter`) |
| react-native `expo` (emite Expo SDK 52) | `expo 52` — C6 aún no publica ese número | expo 52.0.49 (`packages/`) |

## Concurrencia y nombres ambiguos (2026-11-11)

- Las lecturas del contrato no toman el lock del workspace: leen el último catálogo persistido y reverifican la publicación desde disco, así que responden mientras TCG inspecciona otro repositorio. Una publicación reemplazada entre ambas lecturas da STALE.
- Si Graphify dice que un nombre es ambiguo, el resultado es FAILED `QUERY_FAILED` y `warnings` lleva `AMBIGUOUS_NODE_CANDIDATES: <id>, <id>`; repetir con uno de esos ids.

## CONTRATO-003 — referencia de grafo

    tcg technology:reference --workspace "/workspaces/tech" --technology nestjs --version 11 --json

Mismas comprobaciones y códigos que `technology:query`, sin ejecutar Graphify. Imprime un `TechnologyGraphReferenceV1` (`docs/contracts/technology-graph-reference.v1.schema.json`): lo que PCX guarda en el TaskContextPack y DBIG sella en `architecture.lock`. Detalle y correspondencia de campos en [../en/technology-graph-reference-v1.md](../en/technology-graph-reference-v1.md).

En las consultas contractuales e inspecciones se comprueba siempre la versión **real** del ejecutable Graphify, sin reutilizar la caché de 60 segundos de la interfaz interactiva; un motor distinto devuelve STALE hasta publicar un nuevo grafo.
