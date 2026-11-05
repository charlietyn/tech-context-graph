import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { requireGit, runGit } from './git-access';

const RULES = ['graphify-out/', 'tech-graphify-out/', '.tcg/logs/', '.tcg/*.tmp'];
const HEADER = '# Tech Context Graph local state';

async function localExcludePath(root: string, signal?: AbortSignal): Promise<string> {
  return resolve(root, requireGit(await runGit(root, ['rev-parse', '--git-path', 'info/exclude'], { signal }), 'Cannot resolve local excludes'));
}

/** Appends rules missing from the repository-local (never versioned) exclude file. Returns the rules added. */
export async function appendLocalExcludes(root: string, rules: string[], signal?: AbortSignal, comment = '# TCG local artifacts'): Promise<string[]> {
  const excludePath = await localExcludePath(root, signal);
  const previous = existsSync(excludePath) ? await readFile(excludePath, 'utf8') : '';
  const lines = new Set(previous.split(/\r?\n/).map((line) => line.trim()));
  const additions = [...new Set(rules.map((rule) => rule.trim()))].filter((rule) => rule && !lines.has(rule));
  if (additions.length) {
    await mkdir(dirname(excludePath), { recursive: true });
    await writeFile(excludePath, `${previous}${previous.endsWith('\n') || !previous ? '' : '\n'}${comment}\n${additions.join('\n')}\n`);
  }
  return additions;
}

/** Only the exact legacy TCG footer is migrated. Index changes are never rewritten. */
export async function prepareExclusions(root: string, signal?: AbortSignal): Promise<string[]> {
  const notices: string[] = [];
  await appendLocalExcludes(root, RULES.map((rule) => `/${rule}`), signal);
  const excludePath = await localExcludePath(root, signal);
  const path = resolve(root, '.gitignore');
  if (!existsSync(path)) return notices;
  const staged = await runGit(root, ['diff', '--cached', '--quiet', '--', '.gitignore'], { signal });
  if (staged.exitCode !== 0) {
    notices.push('Preserved staged .gitignore changes; automatic migration requires an unchanged index entry.');
    return notices;
  }
  const disk = await readFile(path);
  const head = await runGit(root, ['show', 'HEAD:.gitignore'], { signal });
  const normalize = (value: string) => value.replace(/\r\n/g, '\n');
  const body = normalize(disk.toString('utf8'));
  if (head.exitCode === 0 && body === normalize(head.stdout)) return notices;
  const block = `\n${HEADER}\n.tcg/logs/\n.tcg/*.tmp\n`;
  // This is the exact footer written by WorkspaceInitializerService, not a guessed rule.
  if (body.endsWith(block) && head.exitCode === 0 && body.slice(0, -block.length) === normalize(head.stdout)) {
    const backupRoot = resolve(dirname(excludePath), 'tcg-backups');
    await mkdir(backupRoot, { recursive: true });
    const backup = resolve(backupRoot, `gitignore-${createHash('sha256').update(disk).digest('hex')}.bak`);
    await writeFile(backup, disk, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'EEXIST') throw error; });
    if (!(await readFile(path)).equals(disk)) throw new Error('.gitignore changed during migration; preserved the current file.');
    const stagedAgain = await runGit(root, ['diff', '--cached', '--quiet', '--', '.gitignore'], { signal });
    const headAgain = await runGit(root, ['show', 'HEAD:.gitignore'], { signal });
    if (stagedAgain.exitCode !== 0 || headAgain.stdout !== head.stdout) throw new Error('.gitignore index or HEAD changed during migration; preserved the current file.');
    // Restore the proven unchanged index version using Git's checkout conversion (CRLF/filters).
    requireGit(await runGit(root, ['restore', '--worktree', '--', '.gitignore'], { signal }), 'Cannot restore the migrated .gitignore');
    notices.push(`Migrated the legacy TCG footer to local excludes. Backup: ${backup}`);
  } else {
    notices.push('Preserved .gitignore: its local changes cannot be attributed unambiguously to TCG.');
  }
  return notices;
}
