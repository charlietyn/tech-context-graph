# Modelos

Tipos en `src/models/`. Son interfaces TypeScript sin validación en runtime; solo el YAML se valida con schema.

## `src/models/repository-state.ts`

| Tipo | Uso |
|---|---|
| `StoredRepository` | Forma canónica en la aplicación. El nodo más usado después del store |
| `InspectionStatus` | `NEVER`, `RUNNING`, `READY`, `STALE`, `FAILED`, `MISSING` |
| `CatalogStatus` | `DETECTED`, `ACCEPTED`, `IGNORED`, `REJECTED`, `MISSING` (los dos últimos sin usar) |
| `ScanRootRecord` | Raíz en SQLite |
| `InspectionResult` | Definido; sin uso real en el flujo actual |
| `candidateToStored()` | Conversión a `camelCase` |

**Campos transitorios de `StoredRepository`:** `currentFingerprint`, `freshnessCheckedAt` y `freshnessError` solo los rellena `RepositoryControlService`. No están en SQLite.

`candidateToStored` devuelve un `catalogStatus`, pero `upsertCandidate` no lo usa: decide con su parámetro `newStatus`, que `saveDiscovery` deriva de `candidate.status`.

## `src/models/repository-discovery.ts`

| Tipo | Uso |
|---|---|
| `TechnologyCatalog`, `TechnologyProfile` | Forma de `config/technology-catalog.yaml` |
| `RepositoryCandidate` | Salida del escáner, `snake_case` |
| `RepositoryDiscoveryReport` | Informe de un escaneo |
| `RepositoryArtifactKind`, `PackageEcosystem` | Enums de clasificación |

## `src/models/workspace.ts`

`WorkspaceReference`, `WorkspaceRegistry`, `WorkspaceMarker`, `WorkspaceResolution`.

## Tipos definidos junto a su servicio

| Tipo | Fichero |
|---|---|
| `UpdateOutcome`, `UpdateReport`, `UpdateOptions` | `repository-update.service.ts` |
| `GraphifyInspectionResult`, `InspectionProgress`, `InspectionNotice` | `graphify-cli.service.ts` |
| `RepositoryPullResult` | `repository-git.service.ts` |
| `TechnologyManifest`, `TechnologyAggregateResult` | `technology-graph.service.ts` |
| `ReconcileReport` | `inspection-reconcile.service.ts` |
| `CatalogReviewResult` | `catalog-review.service.ts` |
| `RepositoryManifest`, `ManifestClassification` | `repository-manifest.service.ts` |

## Códigos de `OperationError`

`CANCELLED`, `TIMEOUT`, `OUTPUT_LIMIT`, `PROCESS_START`, `LOCKED`, `NOT_ACCEPTED`, `NOT_GIT`, `DETACHED_HEAD`, `LOCAL_CHANGES`, `NO_UPSTREAM`, `OWNERSHIP`, `AUTHENTICATION`, `PERMISSION`, `NETWORK`, `DIVERGED`, `GIT_FAILED`, `SOURCE_CHANGED`, `EMPTY_GRAPH`.

Son cadenas libres, sin enum. Añadir uno que deba aparecer como `BLOCKED` exige incluirlo en la lista de `RepositoryUpdateService.run`.
