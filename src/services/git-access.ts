import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { OperationError, ProcessOptions, runProcess } from './process-runner';

export function gitRoot(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  let current = realpathSync(path);
  while (true) {
    if (existsSync(resolve(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function classifyGitError(detail: string): string {
  if (/dubious ownership|safe.directory/i.test(detail)) return 'OWNERSHIP';
  if (/authentication|could not read Username|publickey|terminal prompts disabled/i.test(detail)) return 'AUTHENTICATION';
  if (/permission denied|access is denied/i.test(detail)) return 'PERMISSION';
  if (/could not resolve|unable to access|connection|network|timed out/i.test(detail)) return 'NETWORK';
  if (/not possible to fast-forward|divergent|non-fast-forward/i.test(detail)) return 'DIVERGED';
  if (/local changes|untracked working tree|unmerged|not concluded your merge/i.test(detail)) return 'LOCAL_CHANGES';
  return 'GIT_FAILED';
}

/** Pass the same narrowly scoped trust to Git subprocesses launched by Graphify. */
export function scopedGitEnvironment(path: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const root = gitRoot(path);
  if (!root) return env;
  const count = Number(env.GIT_CONFIG_COUNT || 0);
  if (!Number.isInteger(count) || count < 0 || count > 1000) throw new Error('Invalid inherited GIT_CONFIG_COUNT.');
  env.GIT_CONFIG_COUNT = String(count + 1);
  env[`GIT_CONFIG_KEY_${count}`] = 'safe.directory';
  env[`GIT_CONFIG_VALUE_${count}`] = root.replace(/\\/g, '/');
  return env;
}

/** Trust is command-scoped, restricted to the real root of a catalog-selected path. */
export async function runGit(path: string, args: string[], options: ProcessOptions = {}) {
  const root = gitRoot(path);
  const trust = root ? ['-c', `safe.directory=${root.replace(/\\/g, '/')}`] : [];
  return runProcess('git', [...trust, '-C', path, ...args], {
    ...options,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_OPTIONAL_LOCKS: '0', ...options.env },
  });
}

export function requireGit(result: { exitCode: number | null; stderr: string; stdout: string }, context: string): string {
  if (result.exitCode === 0) return result.stdout.trim();
  const detail = result.stderr.trim() || result.stdout.trim();
  throw new OperationError(classifyGitError(detail), `${context}. ${detail || `Git exited with ${result.exitCode}`}`);
}
