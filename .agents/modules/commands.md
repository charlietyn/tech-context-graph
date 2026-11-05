# Módulo: Commands

**Ubicación:** `src/commands/`. Referencia de cada comando en [cli/command-reference.md](../cli/command-reference.md).

| Fichero | Comandos | Dependencias |
|---|---|---|
| `start.command.ts` | `start` | Onboarding, initializer |
| `ui.command.ts` | `ui` | `ConsoleUiService` |
| `workspace.commands.ts` | `workspace:*` | Registry, initializer, onboarding, resolver |
| `root.commands.ts` | `root:*` | `RepositoryRootService` |
| `catalog.commands.ts` | `repository:review` | `CatalogReviewService` |
| `repository-control.commands.ts` | `repository:list/scan/inspect/reconcile/classify/set-source` | Control, update, reconcile, presenter |
| `repository-discovery.commands.ts` | `project:discover/review/prepare/refresh` | Discovery, config, kit, store |
| `project.commands.ts` | `project:add/list` | Config, store, discovery, technology |
| `config.commands.ts` | `config:*` | Config, registry, sqlite |
| `doctor.command.ts` | `doctor` | Config |
| `common-options.ts` | `resolveWorkspacePath`, `resolveRoot` | Node |

## Anatomía

```ts
@Command({ name: 'repository:list', description: '...' })
export class RepositoryListCommand extends CommandRunner {
  constructor(private readonly repositories: RepositoryControlService) { super(); }
  async run(_params: string[], options: Options): Promise<void> {
    const items = await this.repositories.list(resolveWorkspacePath(options.workspace, options.root));
    if (options.json) { console.log(JSON.stringify(items, null, 2)); return; }
    // salida en tabla, separada por tabuladores
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string) { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string) { return value; }
  @Option({ flags: '--json' }) parseJson() { return true; }
}
```

## Trampas

- **Flags `--no-x`:** commander produce `options.x`, no `options.noX`, con valor por defecto `true`. El valor con el flag es **lo que devuelva el parser**, así que este debe devolver `false`. Ver `--no-cluster` en `RepositoryInspectCommand`.
- **Los parsers numéricos no validan:** `--max-depth abc` da `NaN`.
- **Casi todos los tests llaman a `run()` con objetos de opciones**, saltándose commander, y no detectan errores de flags. Para probar un flag, usa `CommandFactory.run` como en `test/repository-inspect.command.spec.ts`.
- **Mensajes obsoletos:** `project:refresh` menciona `tcg graph:code`, que no existe ([R-14](../technical-debt/risks.md)).
- `root:enable`, `root:disable` y `root:remove` no comprueban `params[0]` antes de llamar al servicio.
