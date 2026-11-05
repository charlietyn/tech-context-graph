# Workflow: Añadir un comando

Sustituye a "añadir endpoint": el CLI y su `--json` son la API pública.

1. Elige fichero en `src/commands/`, o crea `<área>.commands.ts`. Usa las áreas `repository`, `root`, `workspace` o `config`.
2. Implementa:

   ```ts
   interface Options { workspace?: string; root?: string; json?: boolean; force?: boolean }

   @Command({ name: 'repository:thing', arguments: '<key>', description: 'One clear sentence.' })
   export class RepositoryThingCommand extends CommandRunner {
     constructor(private readonly repositories: RepositoryControlService) { super(); }
     async run(params: string[], options: Options): Promise<void> {
       if (!params[0]) throw new Error('Usage: tcg repository:thing <key>');
       const workspace = resolveWorkspacePath(options.workspace, options.root);
       const result = await this.repositories.thing(workspace, params[0]);
       if (options.json) { console.log(JSON.stringify(result, null, 2)); return; }
       console.log(`${result.key}: done.`);
     }
     @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
     @Option({ flags: '-r, --root <path>', description: 'Deprecated alias for --workspace.' }) parseRoot(value: string): string { return value; }
     @Option({ flags: '--json' }) parseJson(): boolean { return true; }
   }
   ```

3. **Registra** la clase en `providers` de `src/cli.module.ts`.

## Reglas

- **Sin lógica de negocio.** Si pasa de resolver, llamar e imprimir, va a un servicio.
- **Códigos de salida:** `throw` → 2. Fallo parcial → `process.exitCode = 1`. No uses `process.exit()`: impide liberar el lock.
- **Sin prompts** si no hay TTY.
- **Flags negativos `--no-x`:** se leen como `options.x === false`, no `options.noX`, y el parser debe devolver `false`. Pruébalo con commander real, como en `test/repository-inspect.command.spec.ts`.
- **Valida números:** los parsers actuales no lo hacen; no copies ese fallo.
- Operaciones sobre repositorios: acepta key e id usando `RepositoryControlService.get`.

## Verificar con commander real

Un test que llame a `run()` no comprueba los flags. Compila y ejecuta en sandbox:

```powershell
npm run build
node dist/main.js repository:thing --help
node dist/main.js repository:thing clave --workspace "$env:TEMP\tcg-sandbox\ws" --json
```

## Después

Añade a [command-reference.md](../cli/command-reference.md) y a `docs/en/10-advanced-cli.md` + `docs/es/10-cli-avanzada.md`.

## Alta/evolución de comando de contrato ARGEns

Un cambio de protocolo de `technology:query` exige: DTO versionado en `src/models`, `@Command` en `src/commands`, providers en `src/cli.module.ts`, JSON Schema en `docs/contracts`, fixtures READY/STALE/MISSING/FAILED, tests Jest unitarios, smoke real de binario `dist/main.js` en Quality Windows+Linux, docs EN/ES y `.agents/cli/command-reference.md`. Nunca escribir banners en stdout de JSON, ni hacer pull o writes como efecto de consulta. Ante un breaking change, crear schemaVersion mayor y mantener v1 hasta migración explícita de PCX/AG.
