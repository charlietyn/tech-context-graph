# Dependency Rules

Ninguna herramienta impone estas reglas: no hay ESLint ni comprobación de fronteras en el repo. Se derivan de medir los imports reales del snapshot. **Un PR que introduzca una dirección marcada con 0 es una regresión arquitectónica.**

## Matriz medida (imports relativos entre capas)

| Desde ↓ / Hacia → | commands | ui | services | persistence | models |
|---|---|---|---|---|---|
| **commands** | 8 | 2 | 21 | 3 | 0 |
| **ui** | 0 | 2 | 9 | 1 | 2 |
| **services** | 0 | 2 | 54 | 7 | 17 |
| **persistence** | 0 | 0 | 4 | 4 | 2 |
| **models** | 0 | 0 | 0 | 0 | 1 |

## Prohibido (0 ocurrencias hoy)

- `services`, `persistence`, `ui` o `models` → `commands`
- `persistence` o `models` → `ui`
- `models` → cualquier capa distinta de `models`

## Excepciones conocidas: no las amplíes

| Dependencia | Ficheros | Motivo |
|---|---|---|
| `services` → `ui` | `path-selection.service.ts`, `workspace-onboarding.service.ts` → `ClackPromptService` | Son flujos interactivos colocados en services |
| `persistence` → `services` | `graph-output-path` (puro), `operation-lock`, `config.service` | Primitivas mal ubicadas, no lógica de negocio |
| `commands` → `persistence` | `config.commands`, `project.commands`, `repository-discovery.commands` | Atajos históricos. Un comando nuevo debe usar un servicio |
| `ui` → `persistence` | `console-ui.service.ts` (`store.disable`) | Un único uso |

## Reglas de dirección

1. Las dependencias van hacia abajo: presentación → casos de uso → motor o primitivas → persistencia → modelos.
2. Los comandos no se llaman entre sí; lo compartido va a un servicio.
3. `GraphifyCliService` puede invocar `TechnologyGraphService`; nunca al revés.
4. `RepositoryUpdateService` es el único orquestador de pull + inspección + agregado. CLI y TUI **lo llaman a él**, no replican el flujo.
5. Todo acceso a Git de producción usa `runGit`, que añade `safe.directory`, `GIT_TERMINAL_PROMPT=0` y `GIT_OPTIONAL_LOCKS=0`.

## Dependencias opcionales en constructores

`GraphifyCliService`, `RepositoryControlService` y `CatalogReviewService` declaran colaboradores opcionales (`technologyGraphs?`, `ignores?`, `config?`). `SqliteDatabaseService` y `WorkspaceConfigService` usan valores por defecto (`= new X()`).

Esto existe para que tests y `scripts/verify-update.cjs` instancien clases sin Nest. Consecuencia: **las llamadas usan `?.`, y un colaborador ausente desactiva comportamiento en silencio.** Por ejemplo, sin `ignores` no se aplican exclusiones.

## Dependencias externas

| Paquete | Se usa solo en | No lo uses en |
|---|---|---|
| `sql.js` | `src/persistence/` | Otras capas (solo tipos) |
| `@clack/prompts` | `ClackPromptService` lo carga; `ConsoleUiService`, `PathSelectionService` y `WorkspaceOnboardingService` lo usan | Comandos no interactivos |
| `nest-commander` | `src/commands/`, `main.ts` | Servicios |
| `ajv` | `config-validation.service.ts` | Otras capas |

Runtime mínimo: añadir una dependencia afecta a cada instalación global. Evítalo si Node lo resuelve.
