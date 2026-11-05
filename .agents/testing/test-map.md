# Mapa de tests

| Si cambias... | Ejecuta | Qué protege |
|---|---|---|
| `graphify-cli.service.ts` | `graph-publication`, `graphify-cli.service`, `update-safety` | Publicación, recuperación, parsing de salida, traducción de exit codes |
| `repository-update.service.ts` | `update-safety`, `repository-inspect.command`, `console-ui-batch-pull` | Deduplicación de monorepos, continuar tras bloqueo, cancelación |
| `repository-git.service.ts` | `repository-git.service`, `update-safety` | Fast-forward, dirty, upstream, detached, divergencia, reconciliación |
| `repository-exclusions.ts` | `update-safety` | Migración exacta del pie, cambios staged, worktrees |
| `git-access.ts` | `update-safety` | Clasificación, confianza acotada |
| `repository-fingerprint.service.ts` | `update-safety`, `graph-publication` | Contenido cambiado con mismo status, Git roto |
| `process-runner.ts`, `operation-lock.ts` | `update-safety` | Timeout, cancelación, líneas parciales, dueño de locks |
| `technology-graph.service.ts` | `technology-graph.service`, `graph-publication` | Reubicación, agregado sin cambios |
| `graph-output-path.ts` | `graphify-cli.service`, `graph-output-migration` | Rutas canónicas |
| `inspection-reconcile.service.ts` | `graph-publication` | No curar con grafos antiguos |
| `sqlite-migration.service.ts`, `graph-output-migration.ts` | `graph-output-migration`, `repository-store.service` | Migraciones, conflictos, rutas personalizadas |
| `repository-store.service.ts` | `repository-store.service`, `catalog-review.service`, `graph-publication` | CRUD, source path |
| `sqlite-database.service.ts` | `update-safety`, `repository-store.service` | Lock de propiedad, apertura concurrente |
| `repository-discovery.service.ts`, `repository-manifest.service.ts`, `config/technology-catalog.yaml` | `repository-discovery.service` | Detección, composición, Maven, Gradle, cores |
| `catalog-review.service.ts`, `catalog.commands.ts` | `catalog-review.service`, `repository-review.command` | Compensación, `--accept-all` |
| `config.service.ts`, schema | `config.service` | Defaults, migración, validación |
| `graphify-ignore.service.ts`, `ignore/*` | `graphify-ignore.service` | Fusión, saneamiento |
| `workspace-resolver.service.ts` | `workspace-resolver.service` | Sin usar cwd en silencio |
| `workspace-onboarding.service.ts` | `workspace-onboarding.service` | Navegación Back, nombres duplicados |
| `path-selection.service.ts` | `path-selection.service` | Navegador de carpetas |
| `repository-ui-presenter.service.ts` | `repository-ui-presenter.service` | Tablas, resumen por tecnología |
| `console-ui.service.ts` | `console-ui-batch-pull` | Solo delegación al coordinador |

## Ejecutar

```powershell
npx jest test/update-safety.spec.ts --runInBand
npx jest -t "restores tracked files"
npm test
```

Los ficheros viven en `test/<nombre>.spec.ts`.

## Sin test directo

`src/commands/doctor.command.ts`, `src/commands/project.commands.ts`, `src/commands/repository-discovery.commands.ts`, `src/commands/root.commands.ts`, `src/commands/workspace.commands.ts`, `src/services/repository-root.service.ts`, `src/services/global-workspace-registry.service.ts`, `src/services/workspace-initializer.service.ts`, `src/services/kit-path.service.ts`.
