import { Injectable } from '@nestjs/common';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { StoredRepository } from '../models/repository-state';
import { classifyGitError, runGit, requireGit, gitRoot } from './git-access';
import { OperationError } from './process-runner';
import { prepareExclusions } from './repository-exclusions';
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
    const statusResult = await git(repositoryPath, ['status', '--porcelain=v1', '--untracked-files=normal']);
    this.requireSuccess(statusResult, `Could not inspect the working tree for ${repository.key}`);
    const dirtyEntries = statusResult.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    if (dirtyEntries.length > 0) {
      const preview = dirtyEntries.slice(0, 8).map((line) => `  ${line}`).join('\n');
      const remainder = dirtyEntries.length > 8 ? `\n  ... and ${dirtyEntries.length - 8} more change(s)` : '';
      throw new OperationError('LOCAL_CHANGES',
        `Cannot pull ${repository.key}: the working tree at ${repositoryRoot} has uncommitted or untracked changes. `
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

    let pullResult = await git(repositoryPath, ['pull', '--ff-only', '--no-rebase']);
    if (pullResult.exitCode !== 0 && classifyGitError(this.detail(pullResult)) === 'NETWORK' && !options.signal?.aborted) {
      pullResult = await git(repositoryPath, ['pull', '--ff-only', '--no-rebase']);
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

  private requireSuccess(result: GitCommandResult, message: string): void {
    if (result.exitCode === 0) return;
    throw new OperationError(classifyGitError(this.detail(result)), `${message}. ${this.detail(result)}`);
  }

  private detail(result: GitCommandResult): string {
    const output = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(' ');
    return output || `Git exited with code ${result.exitCode ?? 'unknown'}.`;
  }
}
