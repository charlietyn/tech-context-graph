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

Se incluyen ID, clave, commit Git o null, sourceFingerprint, graphDigestSha256, graphifyVersion, publishedAt e inspectionId. Se verifica integridad y frescura antes y después de consultar Graphify. No se realizan Git pull, descarga, extracción o modificación de código como efecto colateral.

La primera versión selecciona un core único: compatibilidad de librerías y composición multiversión quedan pendientes de certificación con los consumidores. El texto de Graphify es dato no confiable, nunca instrucciones o reglas de negocio aprobadas.

Las consultas legacy del TUI solo almacenan texto si graphify.query_log_disabled es false explícitamente; queryPublished no registra consultas. PCX debe autorizar al usuario/tenant, workspace, presupuesto y fuente de confianza.

Alta manual de un core versionado:

    tcg project:add core-10 /ruta/framework --workspace /ruta/workspace --type technology --category backend --technology nestjs --kind core --technology-version 10.4.1

Posteriormente `repository:inspect core-10` para publicar el grafo. La consulta no registra ni inspecciona fuentes automáticamente.

READY exige también que la versión instalada de Graphify coincida exactamente con la registrada al publicar el grafo; tras actualizar Graphify corresponde re-inspeccionar, no consultar silenciosamente índices potencialmente incompatibles.

El selector v1 **no implementa rangos semver**: pedir prefijo numérico exacto `10`, `10.4` o `10.4.1`; `^10`, `~10`, `latest` son INVALID_INPUT. Core ambiguo o desconocido nunca se resuelve mediante agregados multiversión.
