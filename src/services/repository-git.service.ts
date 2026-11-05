import { Injectable } from '@nestjs/common';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { StoredRepository } from '../models/repository-state';
import { classifyGitError, runGit, requireGit, gitRoot } from './git-access';
import { OperationError } from './process-runner';
import { appendLocalExcludes, prepareExclusions } from './repository-exclusions';
import { acquireLock } from './operation-lock';

export interface RepositoryPullResult {
  repositoryKey: string;
  repositoryPath: string;
  repositoryRoot: string;
  branch: string;
  upstream: string;
  beforeCommit: string;
  afterCommit: string;
  changed: boolean;
  output: string;
  durationMs: number;
  notices?: string[];
}

export function describeRepositoryPull(result: RepositoryPullResult): string {
  const target = `${result.branch} tracking ${result.upstream}`;
  if (!result.changed) return `${result.repositoryKey}: ${target} was already up to date (${result.afterCommit.slice(0, 12)}).`;
  return `${result.repositoryKey}: updated ${target} from ${result.beforeCommit.slice(0, 12)} to ${result.afterCommit.slice(0, 12)}.`;
}

interface GitCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

@Injectable()
export class RepositoryGitService {
  async root(path: string, signal?: AbortSignal): Promise<string> {
    if (!gitRoot(path)) throw new OperationError('NOT_GIT', `${path} is not a Git repository.`);
    return resolve(requireGit(await runGit(path, ['rev-parse', '--show-toplevel'], { signal }), 'Cannot resolve Git root'));
  }

  async pull(repository: Pick<StoredRepository, 'key' | 'path'>, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<RepositoryPullResult> {
    const root = await this.root(repository.path, options.signal);
    const common = requireGit(await runGit(root, ['rev-parse', '--git-common-dir'], options), 'Cannot resolve Git directory');
    const release = await acquireLock(resolve(root, common, 'tcg-update.lock'));
    try { return await this.pullLocked(repository, options); } finally { await release(); }
  }

  private async pullLocked(repository: Pick<StoredRepository, 'key' | 'path'>, options: { signal?: AbortSignal; timeoutMs?: number }): Promise<RepositoryPullResult> {
    const git = (path: string, args: string[]) => runGit(path, args, options);
    const startedAt = Date.now();
    const repositoryPath = resolve(repository.path);
    if (!existsSync(repositoryPath) || !statSync(repositoryPath).isDirectory()) {
      throw new Error(`Repository path is not an existing directory: ${repositoryPath}`);
    }

    const rootResult = await git(repositoryPath, ['rev-parse', '--show-toplevel']);
    this.requireSuccess(rootResult, `The original folder for ${repository.key} is not a Git repository`);
    const repositoryRoot = resolve(rootResult.stdout.trim());

    const branchResult = await git(repositoryPath, ['branch', '--show-current']);
    this.requireSuccess(branchResult, `Could not determine the current branch for ${repository.key}`);
    const branch = branchResult.stdout.trim();
    if (!branch) {
      throw new OperationError('DETACHED_HEAD', `Cannot pull ${repository.key}: the repository is in detached HEAD state at ${repositoryRoot}.`);
    }

    const notices = await prepareExclusions(repositoryRoot, options.signal);
    // Untracked files are left alone: Git itself refuses to overwrite them during a pull.
    let dirtyEntries = await this.trackedChanges(repositoryRoot, repository.key, options);
    const deleted = dirtyEntries.filter((entry) => entry.startsWith(' D ')).map((entry) => entry.slice(3));
    if (deleted.length > 0 && deleted.length === dirtyEntries.length) {
      // Only missing files (interrupted checkout, cleanup tool): restoring them from the index overwrites nothing.
      this.requireSuccess(await runGit(repositoryRoot, ['restore', '--worktree', '--pathspec-from-file=-', '--pathspec-file-nul'],
        { ...options, input: deleted.map((path) => `:(literal)${path}`).join('\0') }), `Could not restore deleted files for ${repository.key}`);
      notices.push(`Restored ${deleted.length} tracked file(s) that were missing from the working tree.`);
      dirtyEntries = await this.trackedChanges(repositoryRoot, repository.key, options);
    }
    if (dirtyEntries.length > 0) {
      const preview = dirtyEntries.slice(0, 8).map((line) => `  ${line}`).join('\n');
      const remainder = dirtyEntries.length > 8 ? `\n  ... and ${dirtyEntries.length - 8} more change(s)` : '';
      throw new OperationError('LOCAL_CHANGES',
        `Cannot pull ${repository.key}: the working tree at ${repositoryRoot} has uncommitted changes to tracked files. `
        + `Preserved all changes. Review them before retrying.\n${preview}${remainder}\n${notices.join('\n')}`,
      );
    }

    const upstreamResult = await git(repositoryPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
    if (upstreamResult.exitCode !== 0) {
      throw new OperationError('NO_UPSTREAM',
        `Cannot pull ${repository.key}: branch ${branch} has no upstream branch. `
        + `Configure one with "git push --set-upstream <remote> ${branch}" or "git branch --set-upstream-to <remote>/<branch>".`,
      );
    }
    const upstream = upstreamResult.stdout.trim();

    const beforeResult = await git(repositoryPath, ['rev-parse', '--verify', 'HEAD']);
    this.requireSuccess(beforeResult, `Could not read the current commit for ${repository.key}`);
    const beforeCommit = beforeResult.stdout.trim();

    let pullResult: GitCommandResult = await git(repositoryPath, ['pull', '--ff-only', '--no-rebase']);
    if (pullResult.exitCode !== 0 && classifyGitError(this.detail(pullResult)) === 'NETWORK' && !options.signal?.aborted) {
      pullResult = await git(repositoryPath, ['pull', '--ff-only', '--no-rebase']);
    }
    if (pullResult.exitCode !== 0 && classifyGitError(this.detail(pullResult)) === 'DIVERGED' && !options.signal?.aborted) {
      pullResult = await this.reconcileDivergence(repository.key, repositoryRoot, branch, upstream, beforeCommit, notices, options);
    }
    if (pullResult.exitCode !== 0) {
      throw new OperationError(classifyGitError(this.detail(pullResult)),
        `Git pull failed for ${repository.key} at ${repositoryRoot}. No graph update was started. ${this.detail(pullResult)}`,
      );
    }

    const afterResult = await git(repositoryPath, ['rev-parse', '--verify', 'HEAD']);
    this.requireSuccess(afterResult, `Git pull completed but the resulting commit could not be read for ${repository.key}`);
    const afterCommit = afterResult.stdout.trim();

    return {
      repositoryKey: repository.key,
      repositoryPath,
      repositoryRoot,
      branch,
      upstream,
      beforeCommit,
      afterCommit,
      changed: beforeCommit !== afterCommit,
      output: [pullResult.stdout.trim(), pullResult.stderr.trim()].filter(Boolean).join('\n'),
      durationMs: Date.now() - startedAt,
      notices,
    };
  }

  /** Tracked changes as porcelain v1 entries ("XY path"); rename sources are dropped. */
  private async trackedChanges(root: string, key: string, options: { signal?: AbortSignal; timeoutMs?: number }): Promise<string[]> {
    const result = await runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=no'], options);
    this.requireSuccess(result, `Could not inspect the working tree for ${key}`);
    const entries: string[] = [];
    const fields = result.stdout.split('\0').filter(Boolean);
    for (let i = 0; i < fields.length; i++) {
      entries.push(fields[i]);
      if (/^[RC]/.test(fields[i])) i++;
    }
    return entries;
  }

  /**
   * The fetch already happened, so the branch has local commits upstream lacks. Commits whose net effect only
   * touches .gitignore (typically "/graphify-out", now covered by .git/info/exclude) are replaced by upstream and
   * their rules kept locally; any other local work is rebased. A backup ref always keeps the previous HEAD.
   */
  private async reconcileDivergence(key: string, root: string, branch: string, upstream: string, beforeCommit: string,
    notices: string[], options: { signal?: AbortSignal; timeoutMs?: number }): Promise<GitCommandResult> {
    const git = (args: string[], input?: string) => runGit(root, args, { ...options, input });
    const local = requireGit(await git(['rev-list', '--count', `${upstream}..HEAD`]), `Cannot count local commits for ${key}`);
    const files = requireGit(await git(['diff', '--name-only', `${upstream}...HEAD`]), `Cannot inspect local commits for ${key}`)
      .split(/\r?\n/).filter(Boolean);
    const backup = `refs/tcg/backups/${branch}/${new Date().toISOString().replace(/[-:.]/g, '')}`;
    requireGit(await git(['update-ref', backup, beforeCommit]), `Cannot create a backup ref for ${key}`);

    if (files.every((file) => file === '.gitignore')) {
      const diff = requireGit(await git(['diff', '-U0', '--no-color', `${upstream}...HEAD`, '--', '.gitignore']), `Cannot read local .gitignore changes for ${key}`);
      const rules = diff.split(/\r?\n/).filter((line) => line.startsWith('+') && !line.startsWith('+++'))
        .map((line) => line.slice(1).trim()).filter((line) => line && !/^(<{7}|={7}|>{7})/.test(line));
      const moved = await appendLocalExcludes(root, rules, options.signal, `# Moved from local .gitignore commits (${backup})`);
      const reset = await git(['reset', '--keep', upstream]);
      if (reset.exitCode === 0) {
        notices.push(`Replaced ${local} local commit(s) that only edited .gitignore with ${upstream}`
          + `${moved.length ? `; kept their rules in .git/info/exclude (${moved.join(', ')})` : ''}. Backup: ${backup}`);
      }
      return reset;
    }

    const rebase = await git(['rebase', '--no-autostash', upstream]);
    if (rebase.exitCode === 0) {
      notices.push(`Rebased ${local} local commit(s) onto ${upstream}. Backup: ${backup}`);
      return rebase;
    }
    await git(['rebase', '--abort']);
    return { exitCode: rebase.exitCode ?? 1, stdout: '', stderr:
      `Not possible to fast-forward: ${local} local commit(s) change ${files.slice(0, 5).join(', ')}${files.length > 5 ? ', ...' : ''} `
      + `and conflict with ${upstream}; the automatic rebase was aborted and the branch is unchanged. `
      + `Resolve with "git rebase ${upstream}" or discard them with "git reset --hard ${upstream}". Backup: ${backup}` };
  }

  private requireSuccess(result: GitCommandResult, message: string): void {
    if (result.exitCode === 0) return;
    throw new OperationError(classifyGitError(this.detail(result)), `${message}. ${this.detail(result)}`);
  }

  private detail(result: GitCommandResult): string {
    const output = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(' ');
    return output || `Git exited with code ${result.exitCode ?? 'unknown'}.`;
  }
}
