import { Command, CommandRunner, Option } from 'nest-commander';
import { WorkspaceConfigService } from '../services/config.service';
import { GlobalWorkspaceRegistryService } from '../services/global-workspace-registry.service';
import { SqliteDatabaseService } from '../persistence/sqlite-database.service';
import { resolveWorkspacePath } from './common-options';

@Command({ name: 'config:paths', description: 'Show every configuration and operational state location.' })
export class ConfigPathsCommand extends CommandRunner {
  constructor(
    private readonly config: WorkspaceConfigService,
    private readonly registry: GlobalWorkspaceRegistryService,
    private readonly sqlite: SqliteDatabaseService,
  ) { super(); }
  async run(_params: string[], options: { workspace?: string; root?: string; json?: boolean }): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const paths = {
      workspace,
      workspaceMarker: `${workspace}/tech-context-graph.workspace.json`,
      editableConfiguration: this.config.configPath(workspace),
      sqliteOperationalState: this.sqlite.getPath(workspace),
      globalWorkspaceRegistry: this.registry.getRegistryPath(),
      graphs: `${workspace}/tech-graphify-out`,
      reports: `${workspace}/context-pack`,
      logs: `${workspace}/.tcg/logs`,
    };
    if (options.json) console.log(JSON.stringify(paths, null, 2));
    else for (const [key, value] of Object.entries(paths)) console.log(`${key}: ${value}`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}

@Command({ name: 'config:show', description: 'Print the resolved editable workspace configuration.' })
export class ConfigShowCommand extends CommandRunner {
  constructor(private readonly config: WorkspaceConfigService) { super(); }
  async run(_params: string[], options: { workspace?: string; root?: string }): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    console.log(JSON.stringify(this.config.load(workspace), null, 2));
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
}

@Command({ name: 'config:validate', description: 'Validate and print the resolved workspace configuration.' })
export class ConfigValidateCommand extends CommandRunner {
  constructor(private readonly config: WorkspaceConfigService) { super(); }
  async run(_params: string[], options: { workspace?: string; root?: string; json?: boolean }): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const resolved = this.config.load(workspace);
    const result = { valid: true, workspace, version: resolved.version };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Configuration is valid: ${workspace} (version ${resolved.version})`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}
