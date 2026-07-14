import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { WorkspaceConfigValidationService } from './config-validation.service';

export interface RepositoryRootConfig {
  path: string;
  enabled: boolean;
  max_depth: number;
  min_confidence: number;
  role: string;
}

@Injectable()
export class WorkspaceConfigService {
  constructor(
    private readonly validation: WorkspaceConfigValidationService = new WorkspaceConfigValidationService(),
  ) {}

  configPath(root: string): string {
    return resolve(root, 'tech-context-graph.yaml');
  }

  load(root: string): Record<string, any> {
    const current = this.configPath(root);
    const path = current;
    const parsed = existsSync(current) ? this.parseYaml(current) : {};
    const migrated = this.migrateLegacyConfiguration(parsed);
    const workspace = migrated.workspace ?? {};
    const resolved = this.mergeDefaults(migrated, {
      id: String(workspace.id ?? this.slug(basename(resolve(root)))),
      name: String(workspace.name ?? (basename(resolve(root)) || 'Technology Context Workspace')),
    });
    this.validation.validate(resolved, existsSync(path) ? path : this.configPath(root));
    return resolved;
  }

  save(root: string, config: Record<string, any>): void {
    const path = this.configPath(root);
    this.validation.validate(config, path);
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, stringify(config, { indent: 2, lineWidth: 120 }), 'utf8');
    renameSync(temporary, path);
  }

  ensureDefault(root: string, workspace: { id: string; name: string }): Record<string, any> {
    const config = this.load(root);
    config.workspace = { ...(config.workspace ?? {}), id: workspace.id, name: workspace.name };
    const merged = this.mergeDefaults(config, workspace);
    this.save(root, merged);
    return merged;
  }

  configureStart(
    root: string,
    values: { projectName: string; backend: string; allowExternalLlm: boolean },
  ): void {
    const config = this.load(root);
    config.version = 4;
    config.workspace ??= {};
    config.workspace.name = values.projectName;
    config.workspace.id ??= this.slug(values.projectName);
    config.graphify ??= {};
    config.graphify.semantic ??= {};
    config.graphify.semantic.backend = values.backend;
    config.security ??= {};
    config.security.allow_external_llm = values.allowExternalLlm;
    this.save(root, this.mergeDefaults(config, {
      id: config.workspace.id,
      name: config.workspace.name,
    }));
  }

  listRepositoryRoots(root: string): RepositoryRootConfig[] {
    const config = this.load(root);
    const roots = Array.isArray(config.repository_discovery?.roots) ? config.repository_discovery.roots : [];
    return roots.map((item: any) => ({
      path: String(item.path),
      enabled: item.enabled !== false,
      max_depth: Number(item.max_depth ?? config.repository_discovery?.default_max_depth ?? 7),
      min_confidence: Number(item.min_confidence ?? config.repository_discovery?.default_min_confidence ?? 60),
      role: String(item.role ?? 'technology'),
    }));
  }

  upsertRepositoryRoot(root: string, value: RepositoryRootConfig): void {
    const config = this.load(root);
    config.repository_discovery ??= {};
    config.repository_discovery.roots ??= [];
    const normalized = resolve(value.path);
    const existing = config.repository_discovery.roots.find((item: any) => resolve(String(item.path)).toLowerCase() === normalized.toLowerCase());
    const next = {
      path: normalized,
      enabled: value.enabled,
      max_depth: value.max_depth,
      min_confidence: value.min_confidence,
      role: value.role,
    };
    if (existing) Object.assign(existing, next);
    else config.repository_discovery.roots.push(next);
    this.save(root, config);
  }

  removeRepositoryRoot(root: string, path: string): void {
    const config = this.load(root);
    if (!Array.isArray(config.repository_discovery?.roots)) return;
    const normalized = resolve(path).toLowerCase();
    config.repository_discovery.roots = config.repository_discovery.roots.filter((item: any) => resolve(String(item.path)).toLowerCase() !== normalized);
    this.save(root, config);
  }

  setRepositoryRootEnabled(root: string, path: string, enabled: boolean): void {
    const config = this.load(root);
    const normalized = resolve(path).toLowerCase();
    const item = config.repository_discovery?.roots?.find((entry: any) => resolve(String(entry.path)).toLowerCase() === normalized);
    if (!item) throw new Error(`Repository root is not configured: ${path}`);
    item.enabled = enabled;
    this.save(root, config);
  }

  private mergeDefaults(config: Record<string, any>, workspace: { id: string; name: string }): Record<string, any> {
    return {
      version: 4,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        ...(config.workspace ?? {}),
        paths: {
          database: './.tcg/state.sqlite',
          logs: './.tcg/logs',
          graphs: './tech-graphify-out',
          reports: './context-pack',
          ...(config.workspace?.paths ?? {}),
        },
      },
      ui: {
        language: 'en',
        color: 'auto',
        confirm_before_scan: true,
        confirm_before_inspection: true,
        show_advanced_actions: false,
        ...(config.ui ?? {}),
      },
      repository_discovery: {
        default_max_depth: 7,
        default_min_confidence: 60,
        maximum_directories: 25000,
        stop_at_detected_repository: true,
        include_unknown_git_repositories: true,
        roots: [],
        ...(config.repository_discovery ?? {}),
      },
      graphify: {
        executable: 'graphify',
        code_only: true,
        force_rebuild: false,
        query_log_disabled: true,
        ...(config.graphify ?? {}),
        semantic: {
          backend: 'ollama',
          mode: 'deep',
          ...(config.semantic ?? {}),
          ...(config.graphify?.semantic ?? {}),
        },
      },
      security: {
        allow_external_llm: false,
        block_sensitive_sources: true,
        scan_secrets: true,
        ...(config.security ?? {}),
      },
      persistence: {
        driver: 'sqlite',
        file: './.tcg/state.sqlite',
        artifact_storage: 'filesystem',
        ...(config.persistence ?? {}),
      },
      projects: config.projects ?? {},
    };
  }

  private parseYaml(path: string): Record<string, any> {
    try {
      const value = parse(readFileSync(path, 'utf8')) ?? {};
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('the document root must be a mapping');
      }
      return value as Record<string, any>;
    } catch (error) {
      throw new Error(`Unable to parse workspace configuration ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private migrateLegacyConfiguration(config: Record<string, any>): Record<string, any> {
    const migrated = structuredClone(config);
    if (migrated.security?.disable_query_log !== undefined) {
      migrated.graphify ??= {};
      migrated.graphify.query_log_disabled ??= Boolean(migrated.security.disable_query_log);
      delete migrated.security.disable_query_log;
    }
    const paths = migrated.workspace?.paths;
    if (paths) {
      paths.graphs ??= paths.graphify_out;
      paths.reports ??= paths.context_pack;
      delete paths.graphify_out;
      delete paths.context_pack;
      delete paths.docs;
    }
    return migrated;
  }

  private slug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'workspace';
  }
}
