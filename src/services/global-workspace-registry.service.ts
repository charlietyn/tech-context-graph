import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { WorkspaceReference, WorkspaceRegistry } from '../models/workspace';

@Injectable()
export class GlobalWorkspaceRegistryService {
  getRegistryPath(): string {
    const override = process.env.TCG_CONFIG_HOME;
    if (override) return resolve(override, 'workspaces.json');
    const currentPlatform = platform();
    if (currentPlatform === 'win32') {
      const appData = process.env.APPDATA || resolve(homedir(), 'AppData', 'Roaming');
      return resolve(appData, 'TechContextGraph', 'workspaces.json');
    }
    if (currentPlatform === 'darwin') {
      return resolve(homedir(), 'Library', 'Application Support', 'TechContextGraph', 'workspaces.json');
    }
    return resolve(process.env.XDG_CONFIG_HOME || resolve(homedir(), '.config'), 'tech-context-graph', 'workspaces.json');
  }

  load(): WorkspaceRegistry {
    const path = this.getRegistryPath();
    if (!existsSync(path)) return { version: 1, recentPaths: [], workspaces: [] };
    try {
      const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<WorkspaceRegistry>;
      return {
        version: 1,
        lastWorkspaceId: value.lastWorkspaceId,
        recentPaths: Array.isArray(value.recentPaths) ? value.recentPaths : [],
        workspaces: Array.isArray(value.workspaces) ? value.workspaces : [],
      };
    } catch {
      return { version: 1, recentPaths: [], workspaces: [] };
    }
  }

  save(registry: WorkspaceRegistry): void {
    const path = this.getRegistryPath();
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    writeFileSync(temporary, JSON.stringify(registry, null, 2) + '\n', 'utf8');
    renameSync(temporary, path);
  }

  listValid(): WorkspaceReference[] {
    return this.load().workspaces.filter((workspace) => existsSync(workspace.path));
  }

  register(values: { id?: string; name: string; path: string; createdAt?: string }): WorkspaceReference {
    const registry = this.load();
    const normalizedPath = resolve(values.path);
    const now = new Date().toISOString();
    const existing = registry.workspaces.find((item) => resolve(item.path).toLowerCase() === normalizedPath.toLowerCase());
    const workspace: WorkspaceReference = existing
      ? { ...existing, name: values.name || existing.name, path: normalizedPath, lastOpenedAt: now }
      : {
          id: values.id || `WS-${randomUUID()}`,
          name: values.name,
          path: normalizedPath,
          createdAt: values.createdAt || now,
          lastOpenedAt: now,
        };
    registry.workspaces = registry.workspaces.filter((item) => item.id !== workspace.id && resolve(item.path).toLowerCase() !== normalizedPath.toLowerCase());
    registry.workspaces.unshift(workspace);
    registry.lastWorkspaceId = workspace.id;
    registry.recentPaths = this.uniquePaths([normalizedPath, ...registry.recentPaths]).slice(0, 12);
    this.save(registry);
    return workspace;
  }

  markOpened(workspace: WorkspaceReference): WorkspaceReference {
    return this.register(workspace);
  }

  remove(idOrPath: string): void {
    const registry = this.load();
    const normalized = resolve(idOrPath).toLowerCase();
    registry.workspaces = registry.workspaces.filter((item) => item.id !== idOrPath && resolve(item.path).toLowerCase() !== normalized);
    if (registry.lastWorkspaceId && !registry.workspaces.some((item) => item.id === registry.lastWorkspaceId)) {
      registry.lastWorkspaceId = registry.workspaces[0]?.id;
    }
    this.save(registry);
  }

  findLast(): WorkspaceReference | undefined {
    const registry = this.load();
    const workspace = registry.workspaces.find((item) => item.id === registry.lastWorkspaceId);
    return workspace && existsSync(workspace.path) ? workspace : undefined;
  }

  addRecentPath(path: string): void {
    const registry = this.load();
    registry.recentPaths = this.uniquePaths([resolve(path), ...registry.recentPaths]).slice(0, 12);
    this.save(registry);
  }

  private uniquePaths(paths: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const path of paths) {
      const normalized = resolve(path);
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
    }
    return output;
  }
}
