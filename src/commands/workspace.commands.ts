import { Command, CommandRunner, Option } from 'nest-commander';
import { GlobalWorkspaceRegistryService } from '../services/global-workspace-registry.service';
import { WorkspaceInitializerService } from '../services/workspace-initializer.service';
import { WorkspaceOnboardingService } from '../services/workspace-onboarding.service';
import { WorkspaceResolverService } from '../services/workspace-resolver.service';

@Command({ name: 'workspace:list', description: 'List workspaces explicitly registered on this computer.' })
export class WorkspaceListCommand extends CommandRunner {
  constructor(private readonly registry: GlobalWorkspaceRegistryService) { super(); }
  async run(_params: string[], options: { json?: boolean }): Promise<void> {
    const registry = this.registry.load();
    if (options.json) { console.log(JSON.stringify(registry, null, 2)); return; }
    console.log(`Registry: ${this.registry.getRegistryPath()}`);
    if (!registry.workspaces.length) { console.log('No workspaces are registered. Run tcg.'); return; }
    for (const workspace of registry.workspaces) {
      const active = workspace.id === registry.lastWorkspaceId ? '*' : ' ';
      console.log(`${active} ${workspace.name}\n  ${workspace.path}`);
    }
  }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}

@Command({ name: 'workspace:create', description: 'Create a workspace interactively or through explicit options.' })
export class WorkspaceCreateCommand extends CommandRunner {
  constructor(
    private readonly onboarding: WorkspaceOnboardingService,
    private readonly initializer: WorkspaceInitializerService,
  ) { super(); }
  async run(_params: string[], options: { path?: string; name?: string; nonInteractive?: boolean }): Promise<void> {
    if (options.nonInteractive || options.path || options.name) {
      if (!options.path || !options.name) throw new Error('--path and --name are both required for explicit creation.');
      const workspace = await this.initializer.create(options.path, options.name);
      console.log(JSON.stringify(workspace, null, 2));
      return;
    }
    const workspace = await this.onboarding.chooseOrCreate();
    if (workspace) console.log(`Workspace ready: ${workspace.path}`);
  }
  @Option({ flags: '--path <path>' }) parsePath(value: string): string { return value; }
  @Option({ flags: '--name <name>' }) parseName(value: string): string { return value; }
  @Option({ flags: '--non-interactive' }) parseNonInteractive(): boolean { return true; }
}

@Command({ name: 'workspace:use', arguments: '<path>', description: 'Open an existing marked workspace and make it the most recently used workspace.' })
export class WorkspaceUseCommand extends CommandRunner {
  constructor(private readonly resolver: WorkspaceResolverService) { super(); }
  async run(params: string[]): Promise<void> {
    if (!params[0]) throw new Error('Usage: tcg workspace:use <path>');
    const result = this.resolver.fromPath(params[0], 'cli');
    console.log(`Active workspace: ${result.workspace?.name}\n${result.workspace?.path}`);
  }
}

@Command({ name: 'workspace:remove', arguments: '<id-or-path>', description: 'Remove a workspace from the global registry without deleting its files.' })
export class WorkspaceRemoveCommand extends CommandRunner {
  constructor(private readonly registry: GlobalWorkspaceRegistryService) { super(); }
  async run(params: string[]): Promise<void> {
    if (!params[0]) throw new Error('Usage: tcg workspace:remove <id-or-path>');
    this.registry.remove(params[0]);
    console.log('Workspace reference removed. No workspace files were deleted.');
  }
}
