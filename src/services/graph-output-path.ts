import { isAbsolute, resolve } from 'node:path';

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
