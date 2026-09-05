import { Command, CommandRunner, Option } from 'nest-commander';
import { RepositoryControlService } from '../services/repository-control.service';
import { GraphifyCliService } from '../services/graphify-cli.service';
import { InspectionReconcileService } from '../services/inspection-reconcile.service';
import { InspectionRow, RepositoryUiPresenterService } from '../ui/repository-ui-presenter.service';
import { resolveWorkspacePath } from './common-options';
import { resolve } from 'node:path';
import { describeRepositoryPull, RepositoryGitService, RepositoryPullResult } from '../services/repository-git.service';

interface Options {
  workspace?: string; root?: string; json?: boolean; inspected?: boolean; maxDepth?: number; force?: boolean;
  noCluster?: boolean; pull?: boolean;
  name?: string; category?: string; technology?: string; technologyLabel?: string; confidence?: number; ignoreProfile?: string;
}

@Command({ name: 'repository:list', description: 'List accepted repositories and the status of each graph.' })
export class RepositoryListCommand extends CommandRunner {
  constructor(private readonly repositories: RepositoryControlService) { super(); }
  async run(_params: string[], options: Options): Promise<void> {
    const items = await this.repositories.list(resolveWorkspacePath(options.workspace, options.root), Boolean(options.inspected));
    if (options.json) { console.log(JSON.stringify(items, null, 2)); return; }
    console.log('STATUS\tKEY\tTECHNOLOGY\tCATEGORY\tSOURCE');
    for (const item of items) console.log(`${item.inspectionStatus}\t${item.key}\t${item.technologyLabel}\t${item.category}\t${item.sourcePath}`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>', description: 'Deprecated alias for --workspace.' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
  @Option({ flags: '--inspected' }) parseInspected(): boolean { return true; }
}

@Command({ name: 'repository:scan', arguments: '<folder>', description: 'Scan an explicit folder and save candidates for human review.' })
export class RepositoryScanCommand extends CommandRunner {
  constructor(private readonly repositories: RepositoryControlService) { super(); }
  async run(params: string[], options: Options): Promise<void> {
    if (!params[0]) throw new Error('Usage: tcg repository:scan <folder>');
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const report = await this.repositories.scan(workspace, params[0], { maxDepth: options.maxDepth });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`Detected ${report.candidate_count} candidate repositories. Run tcg repository:review.`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--max-depth <number>' }) parseMaxDepth(value: string): number { return Number(value); }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}

@Command({ name: 'repository:inspect', arguments: '<keys...>', description: 'Run Graphify on accepted repositories from the SQLite catalog.' })
export class RepositoryInspectCommand extends CommandRunner {
  constructor(
    private readonly repositories: RepositoryControlService,
    private readonly graphify: GraphifyCliService,
    private readonly presenter: RepositoryUiPresenterService,
    private readonly git: RepositoryGitService,
  ) { super(); }
  async run(params: string[], options: Options): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    if (!params.length) throw new Error('Provide one or more repository keys. See: tcg repository:list');
    const rows: InspectionRow[] = [];
    const pullAttempts = new Map<string, { result?: RepositoryPullResult; error?: Error }>();
    for (const key of params) {
      const repository = await this.repositories.get(workspace, key);
      console.log(`Inspecting ${repository.key}...`);
      const startedAt = Date.now();
      try {
        if (options.pull) await this.pullOnce(repository, pullAttempts);
        const result = await this.graphify.inspect(workspace, repository, { force: options.force, noCluster: options.noCluster, onLine: (line) => console.log(`  ${line}`) });
        for (const notice of result.notices) console.log(`  ${notice.impact.toUpperCase()} NOTICE: ${notice.message}`);
        console.log(`  graph.json -> ${result.graphPath}`);
        rows.push({
          key: repository.key,
          ok: true,
          nodeCount: result.nodeCount,
          edgeCount: result.edgeCount,
          communityCount: result.communityCount,
          durationMs: Date.now() - startedAt,
          clustered: result.clustered,
        });
      } catch (error) {
        console.error(`  FAILED: ${error instanceof Error ? error.message : String(error)}`);
        rows.push({ key: repository.key, ok: false, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
      }
    }
    console.log(`\n${this.presenter.inspectionTable(rows)}`);
    if (rows.some((row) => !row.ok)) process.exitCode = 1;
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--force' }) parseForce(): boolean { return true; }
  @Option({ flags: '--pull', description: 'Run git pull --ff-only in the original repository folder before Graphify.' }) parsePull(): boolean { return true; }
  @Option({ flags: '--no-cluster', description: 'Skip community clustering and generate only the structural graph.' }) parseNoCluster(): boolean { return true; }

  private async pullOnce(
    repository: Awaited<ReturnType<RepositoryControlService['get']>>,
    attempts: Map<string, { result?: RepositoryPullResult; error?: Error }>,
  ): Promise<void> {
    const absolutePath = resolve(repository.path);
    const key = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
    const previous = attempts.get(key);
    if (previous?.error) throw previous.error;
    if (previous?.result) {
      console.log(`  Reusing Git pull result for shared repository path: ${repository.path}`);
      console.log(`  ${describeRepositoryPull(previous.result)}`);
      return;
    }

    console.log(`  Pulling ${repository.path}...`);
    try {
      const result = await this.git.pull(repository);
      attempts.set(key, { result });
      console.log(`  ${describeRepositoryPull(result)}`);
      for (const line of result.output.split(/\r?\n/).filter(Boolean)) console.log(`  git: ${line}`);
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      attempts.set(key, { error: failure });
      throw failure;
    }
  }
}

@Command({ name: 'repository:reconcile', description: 'Reconcile recorded inspection state with the graph.json files on disk.' })
export class RepositoryReconcileCommand extends CommandRunner {
  constructor(private readonly reconciler: InspectionReconcileService) { super(); }
  async run(_params: string[], options: Options): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const report = await this.reconciler.reconcile(workspace);
    if (options.json) { console.log(JSON.stringify(report, null, 2)); return; }
    console.log(`Checked ${report.checked} inspection(s): ${report.healed.length} healed, ${report.interrupted.length} settled as interrupted.`);
    for (const entry of report.healed) console.log(`  READY  ${entry.repoKey}: ${entry.from} -> READY (${entry.detail})`);
    for (const entry of report.interrupted) console.log(`  FAILED ${entry.repoKey}: ${entry.from} -> FAILED (${entry.detail})`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}

@Command({ name: 'repository:classify', arguments: '<key>', description: 'Correct the explicit technology classification of an accepted repository.' })
export class RepositoryClassifyCommand extends CommandRunner {
  constructor(private readonly repositories: RepositoryControlService) { super(); }
  async run(params: string[], options: Options): Promise<void> {
    if (!params[0] || !options.technology || !options.category) {
      throw new Error('Usage: tcg repository:classify <key> --technology <id> --category <category> [--technology-label <label>]');
    }
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const repository = await this.repositories.classify(workspace, params[0], {
      name: options.name,
      category: options.category,
      technology: options.technology,
      technologyLabel: options.technologyLabel,
      confidence: options.confidence,
      ignoreProfile: options.ignoreProfile,
    });
    if (options.json) console.log(JSON.stringify(repository, null, 2));
    else console.log(`${repository.key} classified as ${repository.technologyLabel} (${repository.category}).`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--name <name>' }) parseName(value: string): string { return value; }
  @Option({ flags: '--category <category>' }) parseCategory(value: string): string { return value; }
  @Option({ flags: '--technology <technology>' }) parseTechnology(value: string): string { return value; }
  @Option({ flags: '--technology-label <label>' }) parseTechnologyLabel(value: string): string { return value; }
  @Option({ flags: '--confidence <number>' }) parseConfidence(value: string): number { return Number(value); }
  @Option({ flags: '--ignore-profile <profile>' }) parseIgnoreProfile(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}

@Command({
  name: 'repository:set-source',
  arguments: '<key> <folder>',
  description: 'Change the source-code folder Graphify inspects without changing the repository identity.',
})
export class RepositorySetSourceCommand extends CommandRunner {
  constructor(private readonly repositories: RepositoryControlService) { super(); }

  async run(params: string[], options: Options): Promise<void> {
    if (!params[0] || !params[1]) {
      throw new Error('Usage: tcg repository:set-source <key> <folder> [--workspace <path>]');
    }
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const repository = await this.repositories.setSourcePath(workspace, params[0], params[1]);
    if (options.json) console.log(JSON.stringify(repository, null, 2));
    else console.log(`${repository.key} source folder updated to ${repository.sourcePath}`);
  }

  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>', description: 'Deprecated alias for --workspace.' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}
