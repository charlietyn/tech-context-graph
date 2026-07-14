import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, resolve } from 'node:path';

export interface WorkspaceOptions {
  workspace?: string;
  root?: string;
}

export function resolveWorkspacePath(workspace?: string, legacyRoot?: string): string {
  const explicit = workspace || legacyRoot || process.env.TCG_WORKSPACE;
  if (explicit) return requireWorkspace(resolve(explicit));

  const marker = findMarker(process.cwd());
  if (marker) return marker;

  const last = readLastWorkspace();
  if (last) return requireWorkspace(last);

  throw new Error('No workspace is selected. Run "tcg" interactively or pass --workspace <path>.');
}

/** @deprecated Use resolveWorkspacePath. */
export function resolveRoot(root?: string): string {
  return resolveWorkspacePath(undefined, root);
}

function requireWorkspace(path: string): string {
  if (!existsSync(path)) throw new Error(`Workspace path does not exist: ${path}`);
  const marker = resolve(path, 'tech-context-graph.workspace.json');
  if (!existsSync(marker)) {
    throw new Error(`The folder is not a Tech Context Graph workspace: ${path}`);
  }
  return path;
}

function findMarker(start: string): string | undefined {
  let current = resolve(start);
  for (let depth = 0; depth < 16; depth += 1) {
    if (existsSync(resolve(current, 'tech-context-graph.workspace.json'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function readLastWorkspace(): string | undefined {
  const registryPath = globalRegistryPath();
  if (!existsSync(registryPath)) return undefined;
  try {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as any;
    const workspace = registry.workspaces?.find((item: any) => item.id === registry.lastWorkspaceId);
    return workspace?.path && existsSync(workspace.path) ? resolve(workspace.path) : undefined;
  } catch {
    return undefined;
  }
}

function globalRegistryPath(): string {
  const override = process.env.TCG_CONFIG_HOME;
  if (override) return resolve(override, 'workspaces.json');
  if (platform() === 'win32') return resolve(process.env.APPDATA || resolve(homedir(), 'AppData', 'Roaming'), 'TechContextGraph', 'workspaces.json');
  if (platform() === 'darwin') return resolve(homedir(), 'Library', 'Application Support', 'TechContextGraph', 'workspaces.json');
  return resolve(process.env.XDG_CONFIG_HOME || resolve(homedir(), '.config'), 'tech-context-graph', 'workspaces.json');
}
