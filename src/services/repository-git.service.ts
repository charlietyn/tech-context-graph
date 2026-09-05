import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { StoredRepository } from '../models/repository-state';

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
  async pull(repository: Pick<StoredRepository, 'key' | 'path'>): Promise<RepositoryPullResult> {
    const startedAt = Date.now();
    const repositoryPath = resolve(repository.path);
    if (!existsSync(repositoryPath) || !statSync(repositoryPath).isDirectory()) {
      throw new Error(`Repository path is not an existing directory: ${repositoryPath}`);
    }

    const rootResult = await this.git(repositoryPath, ['rev-parse', '--show-toplevel']);
    this.requireSuccess(rootResult, `The original folder for ${repository.key} is not a Git repository`);
    const repositoryRoot = resolve(rootResult.stdout.trim());

    const branchResult = await this.git(repositoryPath, ['branch', '--show-current']);
    this.requireSuccess(branchResult, `Could not determine the current branch for ${repository.key}`);
    const branch = branchResult.stdout.trim();
    if (!branch) {
      throw new Error(`Cannot pull ${repository.key}: the repository is in detached HEAD state at ${repositoryRoot}.`);
    }

    const statusResult = await this.git(repositoryPath, ['status', '--porcelain=v1', '--untracked-files=normal']);
    this.requireSuccess(statusResult, `Could not inspect the working tree for ${repository.key}`);
    const dirtyEntries = statusResult.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
    if (dirtyEntries.length > 0) {
      const preview = dirtyEntries.slice(0, 8).map((line) => `  ${line}`).join('\n');
      const remainder = dirtyEntries.length > 8 ? `\n  ... and ${dirtyEntries.length - 8} more change(s)` : '';
      throw new Error(
        `Cannot pull ${repository.key}: the working tree at ${repositoryRoot} has uncommitted or untracked changes. `
        + `Commit, stash, or remove them manually before retrying.\n${preview}${remainder}`,
      );
    }

    const upstreamResult = await this.git(repositoryPath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
    if (upstreamResult.exitCode !== 0) {
      throw new Error(
        `Cannot pull ${repository.key}: branch ${branch} has no upstream branch. `
        + `Configure one with "git push --set-upstream <remote> ${branch}" or "git branch --set-upstream-to <remote>/<branch>".`,
      );
    }
    const upstream = upstreamResult.stdout.trim();

    const beforeResult = await this.git(repositoryPath, ['rev-parse', '--verify', 'HEAD']);
    this.requireSuccess(beforeResult, `Could not read the current commit for ${repository.key}`);
    const beforeCommit = beforeResult.stdout.trim();

    const pullResult = await this.git(repositoryPath, ['pull', '--ff-only']);
    if (pullResult.exitCode !== 0) {
      throw new Error(
        `Git pull failed for ${repository.key} at ${repositoryRoot}. No graph update was started. ${this.detail(pullResult)}`,
      );
    }

    const afterResult = await this.git(repositoryPath, ['rev-parse', '--verify', 'HEAD']);
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
    };
  }

  private async git(repositoryPath: string, args: string[]): Promise<GitCommandResult> {
    return await new Promise<GitCommandResult>((resolvePromise, reject) => {
      const child = spawn('git', ['-C', repositoryPath, ...args], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('error', (error) => reject(new Error(`Unable to start Git: ${error.message}`)));
      child.on('close', (exitCode) => resolvePromise({ exitCode, stdout, stderr }));
    });
  }

  private requireSuccess(result: GitCommandResult, message: string): void {
    if (result.exitCode === 0) return;
    throw new Error(`${message}. ${this.detail(result)}`);
  }

  private detail(result: GitCommandResult): string {
    const output = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join(' ');
    return output || `Git exited with code ${result.exitCode ?? 'unknown'}.`;
  }
}
