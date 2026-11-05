# Feature: Descubrimiento de repositorios

**Propósito:** recorrer una carpeta, reconocer tecnologías por evidencia y proponer candidatos sin aceptarlos.

| Aspecto | Detalle |
|---|---|
| Entradas | `repository:scan <folder>`, `root:scan`, menú 1, `project:discover`, `project:refresh` |
| Código | `repository-discovery.service.ts`, `repository-manifest.service.ts`, `technology-catalog.service.ts`, `repository-control.service.ts` |
| Configuración | `config/technology-catalog.yaml` + `technology-catalog.override.yaml` del workspace |
| Persistencia | `repositories` (`DETECTED`), `scan_roots`, `context-pack/repository-discovery/*` |
| Tests | `repository-discovery.service.spec.ts`, `repository-store.service.spec.ts` |

## Flujo

```text
discover(workspace, carpeta, opciones)
 → carga catálogo (paquete + override, deep merge; los arrays se reemplazan)
 → BFS con cola:
     visited >= maximum_directories → truncated, parar
     readdir (si falla, se salta)
     detectDirectory → candidato
     si hay candidato y stop_at_detected_repository → no desciende
     salta symlinks y exclude_directories
 → groupCompositeMembers → ensureUniqueKeys
 → (opcional) apply y saveDiscoveryRoot → YAML
 → writeReport → context-pack/
Luego el llamador: store.saveDiscovery → transacción en SQLite
```

## Puntuación (`scoreProfile`)

| Evidencia | Puntos |
|---|---|
| Fichero exacto `files_any` | +35 cada uno |
| Glob `files_glob_any` | +30 cada uno |
| Nombre del manifiesto en core o library | +90 |
| Nombre de carpeta en `core_repository_names_any` | +85 |
| Dependencia Maven o por prefijo | +75 |
| Nombre npm coincidente | +90 |
| Dependencias npm | +70, más hasta +15 |
| Nombre composer core | +90 |
| Requisito composer | +75 |
| `composer extra` | +65 |
| Marcador de texto | +65 cada uno |

Gana la mayor puntuación, con desempate alfabético. La confianza es `min(100, score)`. Sin coincidencia suficiente, una carpeta con `.git` se convierte en `unknown` con 55 si `include_unknown_git_repositories` está activo; esa regla ignora el mínimo de confianza.

## Agrupación compuesta (`groupCompositeMembers`)

Una carpeta que **no** es proyecto, con ≥ 2 hijos detectados, se agrupa si se cumple alguna regla:

1. Su nombre es una tecnología del catálogo.
2. Un perfil cubre ≥ 2 hijos mediante `member_key_aliases`.
3. Todos los hijos tienen la misma tecnología real.

Lo heterogéneo no se agrupa: **nunca adivina entre tecnologías**. Se desactiva con `compose_members: false`.

## Efectos laterales

- `writeReport` escribe los tres informes **antes** de guardar en SQLite.
- Por defecto no escribe en YAML ni acepta nada.
- `--apply` y `project:refresh` escriben `projects:` en YAML y aceptan los candidatos `registered` en SQLite. Un candidato `skipped` (key ya en YAML) no cambia de estado.
- **Un escaneo nunca reactiva un `IGNORED`**, ni con `--apply`.

## Errores y límites conocidos

| Situación | Resultado |
|---|---|
| Carpeta inexistente | `The global folder does not exist...` |
| Manifiesto inválido | Se ignora; el escaneo continúa |
| Sin permiso en subcarpeta | Se salta en silencio |
| Misma key en otra ruta, en otro escaneo | `UNIQUE constraint failed: repositories.repo_key`; **aborta todo el guardado** ([R-03](../technical-debt/risks.md)) |
| Re-escanear un aceptado | Sobrescribe clasificación y key ([R-02](../technical-debt/risks.md)) |

Los settings efectivos son los del **catálogo** (`default_max_depth: 8`), no los de `repository_discovery` en YAML ([R-08](../technical-debt/risks.md)).
