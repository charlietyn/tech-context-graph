import { Command, CommandRunner, Option } from 'nest-commander';
import { WorkspaceConfigService } from '../services/config.service';
import { resolveWorkspacePath } from './common-options';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { RepositoryDiscoveryService } from '../services/repository-discovery.service';
import { TechnologyGraphService } from '../services/technology-graph.service';

@Command({ name: 'project:add', arguments: '<name> <path>', description: 'Manually register a technology, application, or subsystem.' })
export class ProjectAddCommand extends CommandRunner {
  constructor(
    private readonly config: WorkspaceConfigService,
    private readonly store: RepositoryStoreService,
    private readonly discovery: RepositoryDiscoveryService,
    private readonly technologyGraphs: TechnologyGraphService,
  ) { super(); }
  async run(params: string[], options: {
    workspace?: string; root?: string; type?: string; category?: string; technology?: string;
    ignoreProfile?: string; kind?: string; json?: boolean;
  }): Promise<void> {
    if (params.length < 2) throw new Error('Usage: tcg project:add <name> <path> --type technology --category backend --technology nestjs');
    const root = resolveWorkspacePath(options.workspace, options.root);
    const path = resolve(params[1]);
    if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`Project path is not an existing directory: ${path}`);
    const automatic = options.kind === 'auto';
    const detected = automatic ? this.discovery.detectRepository(root, path) : undefined;
    if (automatic && !detected) {
      throw new Error(`Could not classify ${path} from package.json/composer.json or catalog markers.`);
    }
    const key = detected?.key ?? params[0];
    const role = options.type || detected?.role || 'subsystem';
    const category = options.category || detected?.category || role;
    const technology = options.technology || detected?.technology || 'unknown';
    const ignoreProfile = options.ignoreProfile || detected?.ignore_profile || options.technology || 'common';
    const graphOutput = detected?.graph_output ?? (technology !== 'unknown'
      ? `./tech-graphify-out/technologies/${technology}/${key}`
      : `./tech-graphify-out/${key}`);
    const config = this.config.load(root);
    config.projects ??= {};
    const existingAtKey = config.projects[key];
    if (existingAtKey && resolve(existingAtKey.path) !== path) {
      throw new Error(`Repository key "${key}" is already registered for a different path: ${existingAtKey.path}`);
    }
    for (const [existingKey, project] of Object.entries<any>(config.projects)) {
      if (existingKey !== key && resolve(project.path) === path) delete config.projects[existingKey];
    }
    config.projects[key] = {
      type: role,
      category,
      technology,
      path,
      source_path: path,
      graph_output: graphOutput,
      ignore_profile: ignoreProfile,
      artifact_kind: detected?.artifact_kind ?? (role === 'library' ? 'library' : 'unknown'),
      package_ecosystem: detected?.package_ecosystem ?? 'unknown',
      package_name: detected?.package_name,
      package_version: detected?.package_version,
      technology_version: detected?.technology_version,
      technology_constraints: detected?.technology_constraints ?? [],
      enabled: true,
      registration: { source: 'manual', registered_at: new Date().toISOString() },
    };
    this.config.save(root, config);
    await this.store.upsertManual(root, {
      key, path, sourcePath: path, role, category, technology, ignoreProfile, graphOutput,
      name: detected?.name,
      technologyLabel: detected?.technology_label,
      confidence: detected?.confidence,
      markers: detected?.markers,
      gitRepository: detected?.git_repository,
      artifactKind: detected?.artifact_kind,
      packageEcosystem: detected?.package_ecosystem,
      packageName: detected?.package_name,
      packageVersion: detected?.package_version,
      technologyVersion: detected?.technology_version,
      technologyConstraints: detected?.technology_constraints,
      classificationEvidence: detected?.classification_evidence,
    });
    await this.technologyGraphs.organize(root, technology);
    const result = {
      key, path, role, category, technology, graphOutput,
      artifactKind: detected?.artifact_kind ?? 'unknown',
      packageName: detected?.package_name,
      packageVersion: detected?.package_version,
      technologyVersion: detected?.technology_version,
      technologyConstraints: detected?.technology_constraints ?? [],
    };
    console.log(options.json ? JSON.stringify(result, null, 2) : `${key} registered in YAML and SQLite.`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '-t, --type <type>', description: 'technology, backend, frontend, mobile, subsystem, infrastructure, or library.' }) parseType(value: string): string { return value; }
  @Option({ flags: '--category <category>', description: 'Functional category: backend, frontend, mobile, infrastructure, or library.' }) parseCategory(value: string): string { return value; }
  @Option({ flags: '--technology <technology>', description: 'Primary technology: nestjs, laravel, nuxt, flutter...' }) parseTechnology(value: string): string { return value; }
  @Option({ flags: '--ignore-profile <profile>', description: 'Profile from the ignore/ directory: nestjs, laravel, flutter...' }) parseIgnoreProfile(value: string): string { return value; }
  @Option({ flags: '--kind <kind>', description: 'auto, core, library, application, or unknown. auto reads the repository manifest.' }) parseKind(value: string): string { return value; }
  @Option({ flags: '--json', description: 'Structured registration result.' }) parseJson(): boolean { return true; }
}

@Command({ name: 'project:list', description: 'List registered technologies and repositories.' })
export class ProjectListCommand extends CommandRunner {
  constructor(private readonly config: WorkspaceConfigService) { super(); }
  async run(_params: string[], options: { workspace?: string; root?: string; json?: boolean }): Promise<void> {
    const projects = this.config.load(resolveWorkspacePath(options.workspace, options.root)).projects || {};
    if (options.json) { console.log(JSON.stringify(projects, null, 2)); return; }
    if (Object.keys(projects).length === 0) { console.log('No projects are registered. Use tcg project:discover <folder> or tcg project:add.'); return; }
    console.log('KEY\tROLE\tCATEGORY\tTECHNOLOGY\tSTATUS\tSOURCE');
    for (const [name, project] of Object.entries<any>(projects)) {
      console.log(`${name}\t${project.type || 'subsystem'}\t${project.category || '-'}\t${project.technology || '-'}\t${project.enabled === false ? 'disabled' : 'enabled'}\t${project.source_path || project.path}`);
    }
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}
