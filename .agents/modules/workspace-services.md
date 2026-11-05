# Módulo: Servicios de workspace y catálogo

Dominios: [workspace](../domains/workspace.md) y [repository-catalog](../domains/repository-catalog.md).

## Workspace

| Clase | Responsabilidad | Notas |
|---|---|---|
| `GlobalWorkspaceRegistryService` | Registro por máquina | Escritura atómica; corrupto = vacío. Compara rutas en minúsculas |
| `WorkspaceMarkerService` | Leer, crear y buscar marcador | Búsqueda ascendente de 16 niveles |
| `WorkspaceResolverService` | `fromPath`, `resolveNonInteractive` | `fromPath` sí actualiza el registro |
| `WorkspaceInitializerService` | `create`, `adopt` | Crea árbol, YAML y BD |
| `WorkspaceOnboardingService` | Flujos interactivos | Depende de Clack |
| `PathSelectionService` | Navegador de carpetas | Lista unidades en Windows; registra rutas recientes |
| `KitPathService` | Localiza la raíz del paquete | `TCG_KIT_ROOT`, luego busca `package.json` + `config/technology-catalog.yaml` |

## Catálogo

| Clase | Responsabilidad | Notas |
|---|---|---|
| `RepositoryControlService` | Fachada: scan, list, get, classify, setSourcePath, frescura | Enriquece estado; **prefiérela al store** en lecturas de negocio |
| `RepositoryRootService` | Raíces en YAML + SQLite | |
| `CatalogReviewService` | Aceptar e ignorar con compensación | |

## Contrato común

Todo método recibe `workspaceRoot` explícito como primer argumento. Los servicios **no guardan un workspace actual**. Las cachés se indexan por workspace (`freshness`) o se comprueban en cada apertura (`SqliteDatabaseService`).

## Advertencia de instancia

`SqliteDatabaseService` guarda una sola base de datos abierta. Abrir otro workspace **cierra y persiste** la anterior. No intercales operaciones de dos workspaces en un mismo proceso. Abrir otro mientras se está abriendo lanza un error.
