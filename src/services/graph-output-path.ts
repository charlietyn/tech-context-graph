import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const LEGACY_PREFIX = /^\.?[\\/]?graphify-out(?=[\\/]|$)/i;

export function canonicalGraphOutput(output: string): string {
  if (!LEGACY_PREFIX.test(output)) return output;
  const suffix = output.replace(LEGACY_PREFIX, '').replace(/^[\\/]+/, '').replace(/\\/g, '/');
  return `./tech-graphify-out${suffix ? `/${suffix}` : ''}`;
}

export function resolveGraphOutput(workspaceRoot: string, output: string): string {
  const canonical = canonicalGraphOutput(output);
  return isAbsolute(canonical) ? canonical : resolve(workspaceRoot, canonical);
}

export function technologyGraphOutput(technology: string): string {
  return `./tech-graphify-out/technologies/${technology}`;
}

export function technologyMemberGraphOutput(technology: string, repositoryKey: string): string {
  return `${technologyGraphOutput(technology)}/${repositoryKey}`;
}

/** The catalog role and recognition confidence must not change the output root. */
export function repositoryGraphOutput(technology: string | undefined, repositoryKey: string): string {
  return technology && technology !== 'unknown'
    ? technologyMemberGraphOutput(technology, repositoryKey)
    : technologyGraphOutput(repositoryKey);
}

function within(root: string, path: string): boolean {
  const value = relative(root, path);
  return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value));
}

/**
 * TCG-15: a graph output that is inside the workspace by name must stay inside it on disk.
 * A symlink or junction anywhere on the way (an output folder, `technologies/<id>`, the whole
 * `tech-graphify-out`) would make an inspection write generations outside the workspace.
 * Outputs configured on purpose with an absolute path outside the workspace keep their behaviour.
 * The message carries no path: callers may print it.
 */
export function assertGraphOutputContained(workspaceRoot: string, output: string): void {
  const workspace = resolve(workspaceRoot);
  if (!within(workspace, resolve(output))) return;
  let existing = resolve(output);
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  if (!within(realpathSync(workspace), realpathSync(existing))) {
    throw new GraphOutputEscapeError();
  }
}

export class GraphOutputEscapeError extends Error {
  readonly code = 'PATH_ESCAPE';
  constructor() { super('Graph output resolves outside the workspace through a symbolic link or junction; nothing was written.'); }
}
