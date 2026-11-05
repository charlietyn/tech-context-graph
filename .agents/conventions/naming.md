# Nomenclatura

## Ficheros

| Elemento | Patrón | Ejemplo |
|---|---|---|
| Servicio inyectable | `<nombre>.service.ts` | `repository-git.service.ts` |
| Funciones utilitarias | `<nombre>.ts` | `git-access.ts`, `operation-lock.ts` |
| Comandos | `<área>.commands.ts`; uno solo: `<nombre>.command.ts` | `root.commands.ts`, `doctor.command.ts` |
| Modelos | `src/models/<dominio>.ts` | `repository-state.ts` |
| Tests | `test/<nombre>.spec.ts`, plano, no junto al código | `update-safety.spec.ts` |

## Clases

`<Dominio><Rol>Service`, `<Área><Verbo>Command`. Ejemplos: `RepositoryStoreService`, `RootScanCommand`.

## Comandos CLI

`<área>:<verbo>` en minúsculas con guiones: `repository:set-source`. Nuevos comandos: área `repository`, `root`, `workspace` o `config`, no `project`.

## Datos

| Capa | Convención |
|---|---|
| SQL, YAML, JSON de informes, `RepositoryCandidate`, catálogo | `snake_case` |
| TypeScript de dominio, `StoredRepository`, `--json` de `repository:*` | `camelCase` |
| Estados | `UPPER_SNAKE` |
| Listas en SQL | Sufijo `_json` |

## Identificadores

| Elemento | Formato |
|---|---|
| Workspace | `WS-<uuid>` |
| Raíz | `ROOT-<12 hex>` |
| Repositorio descubierto | `REPO-CAND-<10 hex>` |
| Repositorio manual | `REPO-<12 hex>` |
| Key de core | `<tech>-core-<major\|unknown>` |
| Marcadores de evidencia | `prefijo:valor`: `package:vue`, `member_of:vue`, `manual:nestjs`, `legacy-core:...` |

## Vocabulario

| Usa | Significado | Evita |
|---|---|---|
| workspace | Carpeta de control | project, root (`--root` es alias obsoleto) |
| repository root, search folder | Carpeta a escanear | root a secas |
| inspection | Ejecución de Graphify | scan |
| scan, discovery | Buscar repositorios | inspection |
| source path | Lo que inspecciona Graphify | path |
| publication, generation | Grafo vigente y carpeta | build |

Prefijos propios: variables `TCG_`, locks `tcg-*.lock` y `.tcg-*`, refs `refs/tcg/`.
