# Feature: Pull + actualización de grafos

**Propósito:** actualizar repositorios desde su upstream y regenerar sus grafos en lote, aislando fallos.

**Es el único código que modifica repositorios reales del usuario.** Trátalo como de alto riesgo.

| Aspecto | Detalle |
|---|---|
| Entradas | `repository:inspect <keys\|all> --pull`, menú 4, detalle de proyecto |
| Código | `repository-update.service.ts`, `repository-git.service.ts`, `repository-exclusions.ts`, `git-access.ts` |
| Tests | `update-safety.spec.ts`, `repository-git.service.spec.ts`, `console-ui-batch-pull.spec.ts` |

## Coordinador: `RepositoryUpdateService.run`

```text
log update-<id>.log (antes de Git)
AbortController enlazado a signal, SIGINT y SIGTERM
lock .tcg/update.lock
exige ACCEPTED + enabled, si no NOT_ACCEPTED (falla todo el lote)
si --pull:
   por repositorio: raíz Git real, deduplica por raíz, agrupa por git-common-dir
   TCG_GIT_CONCURRENCY workers (defecto 3, 1..8)
   cada grupo en serie (worktrees comparten directorio Git)
por repositorio, EN SERIE:
   error del pull → fila BLOCKED o FAILED, sin extraer
   graphify.inspect(deferAggregate)
por tecnología con algún ok:
   technologies.refresh
siempre: update-<id>.json, libera locks y listeners
```

Un fallo independiente nunca detiene el lote. El comando termina con código 1 si algo falla.

## Pull: `RepositoryGitService.pullLocked`

Se ejecuta en `repository.path` (no en `sourcePath`), con lock `<git-common-dir>/tcg-update.lock`.

1. La ruta existe y es directorio; resuelve la raíz.
2. Rama actual; vacía → `DETACHED_HEAD`.
3. `prepareExclusions`.
4. Cambios **rastreados** (untracked se ignora; Git se niega por sí solo a sobrescribirlos).
5. **Si solo hay borrados ` D `:** `git restore --worktree` de esos ficheros, con aviso.
6. Otros cambios → `LOCAL_CHANGES`, sin tocar nada.
7. Upstream ausente → `NO_UPSTREAM`.
8. `git pull --ff-only --no-rebase`; si el error es de red, un reintento.
9. **Si divergió → `reconcileDivergence`.**
10. Otro fallo → `OperationError(classifyGitError)`.

## Reconciliación de divergencia

Siempre crea primero la ref de respaldo `refs/tcg/backups/<rama>/<timestamp>`.

| Commits locales | Acción |
|---|---|
| Efecto neto solo sobre `.gitignore` | Mueve sus reglas a `.git/info/exclude`, luego `git reset --keep <upstream>` |
| Cualquier otro | `git rebase --no-autostash <upstream>` |
| Conflicto en rebase | `git rebase --abort`; la rama queda intacta, error `DIVERGED` con instrucciones |

Este comportamiento es intencional y está documentado en `docs/en/15-git-pull-before-inspection.md` y `docs/es/15-git-pull-antes-inspeccion.md`. **Si lo cambias, actualiza ambos y `CHANGELOG.md`.** Los textos de la TUI y de `--help` aún no lo reflejan ([R-06](../technical-debt/risks.md)).

## Exclusiones: `prepareExclusions`

- Añade `/graphify-out/`, `/tech-graphify-out/`, `/.tcg/logs/`, `/.tcg/*.tmp` a `info/exclude`, nunca a `.gitignore`.
- **Migra solo** el pie exacto legacy de TCG en `.gitignore`, si el resto coincide con `HEAD` y no hay cambios staged. Hace copia en `info/tcg-backups/`.
- Cualquier otra situación: conserva el fichero y deja un aviso.

## Clasificación de errores Git (`classifyGitError`)

`OWNERSHIP`, `AUTHENTICATION`, `PERMISSION`, `NETWORK`, `DIVERGED`, `LOCAL_CHANGES`, `GIT_FAILED`, además de `NOT_GIT`, `DETACHED_HEAD`, `NO_UPSTREAM`. El orden de las regex importa.

## Timeouts

Los comandos Git usan el default de `runProcess`, 120 s, sin configuración posible ([R-11](../technical-debt/risks.md)).

## Prohibido en este flujo

`git clean`, `git stash`, `reset --hard`, merge automático, configuración global de Git, `safe.directory=*`, descartar cambios locales del usuario.
