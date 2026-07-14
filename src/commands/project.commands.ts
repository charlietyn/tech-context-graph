import { Command, CommandRunner, Option } from 'nest-commander';
import { WorkspaceConfigService } from '../services/config.service';
import { resolveWorkspacePath } from './common-options';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

@Command({ name: 'project:add', arguments: '<name> <path>', description: 'Manually register a technology, application, or subsystem.' })
export class ProjectAddCommand extends CommandRunner {
  constructor(private readonly config: WorkspaceConfigService, private readonly store: RepositoryStoreService) { super(); }
  async run(params: string[], options: { workspace?: string; root?: string; type?: string; category?: string; technology?: string; ignoreProfile?: string }): Promise<void> {
    if (params.length < 2) throw new Error('Usage: tcg project:add <name> <path> --type technology --category backend --technology nestjs');
    const root = resolveWorkspacePath(options.workspace, options.root);
    const path = resolve(params[1]);
    if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`Project path is not an existing directory: ${path}`);
    const key = params[0];
    const role = options.type || 'subsystem';
    const category = options.category || role;
    const technology = options.technology || 'unknown';
    const ignoreProfile = options.ignoreProfile || options.technology || 'common';
    const graphOutput = `./tech-graphify-out/technologies/${key}`;
    const config = this.config.load(root);
    config.projects ??= {};
    config.projects[key] = {
      type: role,
      category,
      technology,
      path,
      graph_output: graphOutput,
      ignore_profile: ignoreProfile,
      enabled: true,
      registration: { source: 'manual', registered_at: new Date().toISOString() },
    };
    this.config.save(root, config);
    await this.store.upsertManual(root, {
      key, path, role, category, technology, ignoreProfile, graphOutput,
    });
    console.log(`${key} registered in YAML and SQLite.`);
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '-t, --type <type>', description: 'technology, backend, frontend, mobile, subsystem, infrastructure, or library.' }) parseType(value: string): string { return value; }
  @Option({ flags: '--category <category>', description: 'Functional category: backend, frontend, mobile, infrastructure, or library.' }) parseCategory(value: string): string { return value; }
  @Option({ flags: '--technology <technology>', description: 'Primary technology: nestjs, laravel, nuxt, flutter...' }) parseTechnology(value: string): string { return value; }
  @Option({ flags: '--ignore-profile <profile>', description: 'Profile from the ignore/ directory: nestjs, laravel, flutter...' }) parseIgnoreProfile(value: string): string { return value; }
}

@Command({ name: 'project:list', description: 'List registered technologies and repositories.' })
export class ProjectListCommand extends CommandRunner {
  constructor(private readonly config: WorkspaceConfigService) { super(); }
  async run(_params: string[], options: { workspace?: string; root?: string; json?: boolean }): Promise<void> {
    const projects = this.config.load(resolveWorkspacePath(options.workspace, options.root)).projects || {};
    if (options.json) { console.log(JSON.stringify(projects, null, 2)); return; }
    if (Object.keys(projects).length === 0) { console.log('No projects are registered. Use tcg project:discover <folder> or tcg project:add.'); return; }
    console.log('KEY\tROLE\tCATEGORY\tTECHNOLOGY\tSTATUS\tPATH');
    for (const [name, project] of Object.entries<any>(projects)) {
      console.log(`${name}\t${project.type || 'subsystem'}\t${project.category || '-'}\t${project.technology || '-'}\t${project.enabled === false ? 'disabled' : 'enabled'}\t${project.path}`);
    }
  }
  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}
