import { Command, CommandRunner, Option } from 'nest-commander';
import { resolve } from 'node:path';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { RepositoryDiscoveryService } from '../services/repository-discovery.service';
import { WorkspaceConfigService } from '../services/config.service';
import { KitPathService } from '../services/kit-path.service';
import { resolveRoot } from './common-options';
import { RepositoryStoreService } from '../persistence/repository-store.service';

interface DiscoverOptions {
  root?: string;
  maxDepth?: number;
  minConfidence?: number;
  role?: string;
  apply?: boolean;
  saveRoot?: boolean;
  json?: boolean;
}

@Command({
  name: 'project:discover',
  arguments: '<folder>',
  description: 'Inspect a global folder and propose repositories/technologies without silently registering them.',
})
export class ProjectDiscoverCommand extends CommandRunner {
  constructor(private readonly discovery: RepositoryDiscoveryService, private readonly store: RepositoryStoreService) { super(); }

  async run(params: string[], options: DiscoverOptions): Promise<void> {
    if (!params[0]) throw new Error('Usage: tcg project:discover <global-folder> [--apply]');
    const workspaceRoot = resolveRoot(options.root);
    const report = this.discovery.discover(workspaceRoot, resolve(params[0]), {
      maxDepth: options.maxDepth,
      minConfidence: options.minConfidence,
      role: options.role,
      apply: options.apply,
      saveRoot: options.saveRoot,
    });
    await this.store.saveDiscovery(workspaceRoot, report);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`\nScanned folder: ${report.scan_root}`);
    console.log(`Directories visited: ${report.visited_directories}`);
    console.log(`Candidate repositories: ${report.candidate_count}`);
    if (report.truncated) console.log('WARNING: the directory limit was reached; increase the limit if necessary.');
    console.log('');
    for (const candidate of report.candidates) {
      const marker = candidate.status === 'registered' ? 'REGISTERED' : 'CANDIDATE';
      console.log(`[${marker}] ${candidate.key}`);
      console.log(`  Technology: ${candidate.technology_label}`);
      console.log(`  Category: ${candidate.category}`);
      console.log(`  Confidence: ${candidate.confidence}%`);
      console.log(`  Path: ${candidate.path}`);
      console.log(`  Evidence: ${candidate.markers.join(', ') || '.git only'}`);
      if (candidate.warnings.length) console.log(`  Attention: ${candidate.warnings.join(' ')}`);
      console.log('');
    }
    console.log('Report: context-pack/repository-discovery/REPOSITORY_DISCOVERY.md');
    if (!options.apply) console.log(`To register them: tcg project:discover "${report.scan_root}" --apply --save-root`);
    else console.log(`Registered: ${report.registered_count}; skipped: ${report.skipped_count}.`);
  }

  @Option({ flags: '-r, --root <path>', description: 'Tech Context Graph workspace.' })
  parseRoot(value: string): string { return value; }

  @Option({ flags: '--max-depth <number>', description: 'Maximum traversal depth.' })
  parseMaxDepth(value: string): number { return Number.parseInt(value, 10); }

  @Option({ flags: '--min-confidence <number>', description: 'Minimum confidence from 0 to 100.' })
  parseMinConfidence(value: string): number { return Number.parseInt(value, 10); }

  @Option({ flags: '--role <role>', description: 'Registered role: technology, backend, frontend, mobile, subsystem...' })
  parseRole(value: string): string { return value; }

  @Option({ flags: '--apply', description: 'Register candidates in tech-context-graph.yaml.' })
  parseApply(): boolean { return true; }

  @Option({ flags: '--save-root', description: 'Save the folder as a discovery root for future runs.' })
  parseSaveRoot(): boolean { return true; }

  @Option({ flags: '--json', description: 'Structured output for automation.' })
  parseJson(): boolean { return true; }
}

@Command({ name: 'project:review', description: 'Show the latest detected repository report.' })
export class ProjectReviewCommand extends CommandRunner {
  constructor(private readonly discovery: RepositoryDiscoveryService) { super(); }
  async run(_params: string[], options: { root?: string; json?: boolean }): Promise<void> {
    const report = this.discovery.readLatest(resolveRoot(options.root));
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      for (const candidate of report.candidates) {
        console.log(`${candidate.status}\t${candidate.key}\t${candidate.technology}\t${candidate.category}\t${candidate.confidence}%\t${candidate.path}`);
      }
    }
  }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}

@Command({
  name: 'project:prepare',
  arguments: '<name>',
  description: 'Prepare a registered repository, for example by installing a recommended .graphifyignore.',
})
export class ProjectPrepareCommand extends CommandRunner {
  constructor(
    private readonly config: WorkspaceConfigService,
    private readonly kitPath: KitPathService,
  ) { super(); }

  async run(params: string[], options: { root?: string; writeIgnore?: boolean; force?: boolean }): Promise<void> {
    const name = params[0];
    if (!name) throw new Error('Usage: tcg project:prepare <name> --write-ignore');
    const workspaceRoot = resolveRoot(options.root);
    const config = this.config.load(workspaceRoot);
    const project = config.projects?.[name];
    if (!project) throw new Error(`Project '${name}' is not registered.`);
    if (!options.writeIgnore) {
      console.log('No changes were requested. Use --write-ignore to create the recommended file.');
      return;
    }
    const projectPath = resolve(workspaceRoot, project.path);
    if (!existsSync(projectPath)) throw new Error(`The project path does not exist: ${projectPath}`);
    const commonPath = resolve(this.kitPath.findKitRoot(), 'ignore', 'common.graphifyignore');
    const profileName = project.ignore_profile || 'common';
    const profilePath = resolve(this.kitPath.findKitRoot(), 'ignore', `${profileName}.graphifyignore`);
    const destination = resolve(projectPath, '.graphifyignore');
    if (existsSync(destination) && !options.force) {
      throw new Error(`${destination} already exists. Review it or rerun with --force to create a backup and replace it.`);
    }
    if (existsSync(destination)) copyFileSync(destination, `${destination}.tcg-backup`);
    const common = existsSync(commonPath) ? readFileSync(commonPath, 'utf8').trim() : '';
    const profile = existsSync(profilePath) && profilePath !== commonPath ? readFileSync(profilePath, 'utf8').trim() : '';
    writeFileSync(destination, `# Generated by Tech Context Graph for ${name}\n${common}\n\n${profile}\n`, 'utf8');
    console.log(`Created: ${destination}`);
    console.log('Review the file before scanning. The source code was not modified.');
  }

  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--write-ignore' }) parseWriteIgnore(): boolean { return true; }
  @Option({ flags: '--force' }) parseForce(): boolean { return true; }
}


@Command({ name: 'project:refresh', description: 'Rescan all saved global roots and register new technologies.' })
export class ProjectRefreshCommand extends CommandRunner {
  constructor(
    private readonly config: WorkspaceConfigService,
    private readonly discovery: RepositoryDiscoveryService,
    private readonly store: RepositoryStoreService,
  ) { super(); }

  async run(_params: string[], options: { root?: string; json?: boolean }): Promise<void> {
    const workspaceRoot = resolveRoot(options.root);
    const config = this.config.load(workspaceRoot);
    const roots = (config.repository_discovery?.roots ?? []).filter((item: any) => item.enabled !== false);
    if (roots.length === 0) throw new Error('No roots are saved. Use project:discover <folder> --save-root first.');
    const summaries: any[] = [];
    for (const item of roots) {
      const report = this.discovery.discover(workspaceRoot, item.path, {
        maxDepth: item.max_depth,
        minConfidence: config.repository_discovery?.min_confidence,
        role: item.role || config.repository_discovery?.role || 'technology',
        apply: true,
      });
      await this.store.saveDiscovery(workspaceRoot, report);
      summaries.push({ root: item.path, candidates: report.candidate_count, registered: report.registered_count, skipped: report.skipped_count });
    }
    if (options.json) console.log(JSON.stringify(summaries, null, 2));
    else {
      for (const summary of summaries) console.log(`${summary.root}: ${summary.registered} new, ${summary.skipped} existing, ${summary.candidates} candidates.`);
      console.log('Run tcg project:list and tcg graph:code to create any missing graphs.');
    }
  }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}
