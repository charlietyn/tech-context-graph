import { Command, CommandRunner, Option } from 'nest-commander';
import { RepositoryRootService } from '../services/repository-root.service';
import { resolveWorkspacePath } from './common-options';

interface WorkspaceOption { workspace?: string; root?: string }

@Command({ name: 'root:list', description: 'List repository search folders stored in YAML and SQLite.' })
export class RootListCommand extends CommandRunner {
  constructor(private readonly roots: RepositoryRootService) { super(); }
  async run(_params: string[], options: WorkspaceOption & { json?: boolean }): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const roots = await this.roots.list(workspace);
    if (options.json) console.log(JSON.stringify(roots, null, 2));
    else for (const root of roots) console.log(`${root.enabled ? 'enabled' : 'disabled'}\t${root.id}\t${root.path}\tdepth=${root.maxDepth}\tconfidence=${root.minConfidence}`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>', description: 'Deprecated alias for --workspace.' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}

@Command({ name: 'root:add', arguments: '<path>', description: 'Add an explicit repository search folder. No path is guessed.' })
export class RootAddCommand extends CommandRunner {
  constructor(private readonly roots: RepositoryRootService) { super(); }
  async run(params: string[], options: WorkspaceOption & { maxDepth?: number; minConfidence?: number; role?: string }): Promise<void> {
    if (!params[0]) throw new Error('Usage: tcg root:add <path>');
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const root = await this.roots.add(workspace, {
      path: params[0],
      maxDepth: options.maxDepth,
      minConfidence: options.minConfidence,
      role: options.role,
    });
    console.log(JSON.stringify(root, null, 2));
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--max-depth <number>' }) parseMaxDepth(value: string): number { return Number(value); }
  @Option({ flags: '--min-confidence <number>' }) parseMinConfidence(value: string): number { return Number(value); }
  @Option({ flags: '--role <role>' }) parseRole(value: string): string { return value; }
}

@Command({ name: 'root:scan', arguments: '<id-or-path>', description: 'Scan one already configured repository root.' })
export class RootScanCommand extends CommandRunner {
  constructor(private readonly roots: RepositoryRootService) { super(); }
  async run(params: string[], options: WorkspaceOption & { json?: boolean }): Promise<void> {
    if (!params[0]) throw new Error('Usage: tcg root:scan <id-or-path>');
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const report = await this.roots.scan(workspace, params[0]);
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`Detected ${report.candidate_count} candidates. Run tcg repository:review.`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}

@Command({ name: 'root:enable', arguments: '<id>', description: 'Enable a repository search folder.' })
export class RootEnableCommand extends CommandRunner {
  constructor(private readonly roots: RepositoryRootService) { super(); }
  async run(params: string[], options: WorkspaceOption): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    await this.roots.setEnabled(workspace, params[0], true);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
}

@Command({ name: 'root:disable', arguments: '<id>', description: 'Disable a repository search folder without deleting repository history.' })
export class RootDisableCommand extends CommandRunner {
  constructor(private readonly roots: RepositoryRootService) { super(); }
  async run(params: string[], options: WorkspaceOption): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    await this.roots.setEnabled(workspace, params[0], false);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
}

@Command({ name: 'root:remove', arguments: '<id>', description: 'Remove a repository search folder from configuration without deleting graphs.' })
export class RootRemoveCommand extends CommandRunner {
  constructor(private readonly roots: RepositoryRootService) { super(); }
  async run(params: string[], options: WorkspaceOption): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    await this.roots.remove(workspace, params[0]);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
}
