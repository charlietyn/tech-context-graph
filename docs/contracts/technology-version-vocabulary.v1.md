# ARGEns TCG ↔ AG ↔ PCX: vocabulario tecnológico v1

**CONTRACT-002/006**, productor TCG (sin autoridad de negocio ni permisionado). Todos los consumidores deben validar `schemaVersion` y rechazar valores desconocidos.

| Campo | Significado | Productor/propietario | Invariante |
|---|---|---|---|
| `technology` | ID tecnológico de catálogo | TCG | Debe ser core ACCEPTED |
| `versionConstraint` | Prefijo numérico solicitado del **framework**, p. ej. `10` o `10.4` | PCX / AG request | No `latest`, `^10`, `~10` en v1 |
| `resolvedVersion` / `technologyVersion` | Versión del core realmente seleccionada | TCG | Compatible y unívoca; no mezclada entre majors |
| `packageVersion` | Versión publicada de una librería | Catálogo TCG | **No** sustituye `technologyVersion` |
| `technologyConstraints[]` | Compatibilidad declarada de una librería con frameworks | TCG | No se compone en CONTRACT-002 v1 sin aprobación de selector |
| `graphifyVersion` | Binario Python que construyó el grafo | Graphify / puntero | Debe coincidir con el consultado |
| `sourceFingerprint` | Estado exacto de ficheros/tracked+dirty source | TCG fingerprint-v2 | Verificar antes y después de query |
| `repositoryCommit` | Git HEAD (null sin Git) | TCG | **No** sustituye el fingerprint dirty |
| `graphDigestSha256` / `graphHash` | SHA-256 de bytes `graph.json` publicado | TCG | Verificación content-addressed |
| `pointerInspectionId` | ID de inspección atómica SQLite | TCG | Debe coincidir con última READY |
| `capabilityHash` | Hash del descriptor de capacidades de Apps Generator | AG / PCX | **No** es un hash de Graphify, fuente o grafo |
| `AG tech-graph metadata 1.0` | Sidecar del generador, contrato AG | AG | Distinto del manifest `technology.json` de TCG |
| `TCG technology.json 2` | Manifiesto por familia de tecnología | TCG | No tratarlo como metadata AG 1.0 |

## Matriz negativa (contract tests)

Fixture: `test/fixtures/contracts/technology-context/v1/technology-version-matrix.json`.

- NestJS core 10 y 11: `--version 10` selecciona **solo 10**; `--version 11` **solo 11**.
- NestJS core 12 ausente: MISSING / VERSION_MISMATCH, **nunca aggregate 10+11**.
- Librerías asociadas a 10 o `^10 || ^11`: su `packageVersion` y constraints NO cambian la selección del core; se incluirán solo tras contrato certificado de composición compatible.
- Dos core de la misma major aprobados: MISSING / VERSION_MISMATCH por ambigüedad, no orden implícito.

El consumidor PCX debe construir el ContextPack a partir de una respuesta READY versionada y con fuentes de TCG; una respuesta TCG NO aprueba casos de uso. El consumidor AG debe conservar su sidecar 1.0 hasta migración concertada, no reinterpretar un manifest v2.
