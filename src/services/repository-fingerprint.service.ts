import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { StoredRepository } from '../models/repository-state';
import { gitRoot, requireGit, runGit } from './git-access';
import { OperationError } from './process-runner';

/**
 * A fingerprint plus the Git facts it was computed from. `gitHead`/`clean` come from the same
 * `rev-parse`/`status` calls as the fingerprint, so provenance never needs a second, racy Git read.
 * `clean` is scoped to `sourcePath` (a monorepo subdirectory is clean when its own subtree is).
 */
export interface SourceFingerprint {
  value: string;
  gitHead: string | null;
  clean: boolean | null;
}

@Injectable()
export class RepositoryFingerprintService {
  async calculate(repository: Pick<StoredRepository, 'sourcePath'>, signal?: AbortSignal): Promise<string> {
    return (await this.describe(repository, signal)).value;
  }

  async describe(repository: Pick<StoredRepository, 'sourcePath'>, signal?: AbortSignal): Promise<SourceFingerprint> {
    const path = resolve(repository.sourcePath);
    if (!existsSync(path)) return { value: 'missing', gitHead: null, clean: null };
    const hash = createHash('sha256').update(path);
    const root = gitRoot(path);
    if (root) {
      let directory = path;
      while (true) {
        for (const name of ['.gitignore', '.graphifyignore']) {
          const ruleFile = resolve(directory, name);
          if (existsSync(ruleFile)) hash.update(ruleFile).update(await readFile(ruleFile));
        }
        if (directory === root || dirname(directory) === directory) break;
        directory = dirname(directory);
      }
      const head = requireGit(await runGit(path, ['rev-parse', 'HEAD'], { signal, timeoutMs: 15_000 }), 'Cannot read Git HEAD');
      const status = await runGit(path, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'], { signal, timeoutMs: 15_000 });
      requireGit(status, 'Cannot read Git status');
      hash.update(head).update(status.stdout);
      const excludePath = requireGit(await runGit(path, ['rev-parse', '--git-path', 'info/exclude'], { signal, timeoutMs: 15_000 }), 'Cannot resolve Git excludes');
      if (existsSync(resolve(path, excludePath))) hash.update(await readFile(resolve(path, excludePath)));
      const gitHead = /^[a-f0-9]{40,64}$/.test(head) ? head : null;
      if (!status.stdout) return { value: `git-v2:${hash.digest('hex')}`, gitHead, clean: true };
      const changed = await runGit(path, ['ls-files', '-z', '--modified', '--others', '--exclude-standard', '--', '.'], { signal, timeoutMs: 15_000 });
      requireGit(changed, 'Cannot enumerate changed files');
      const staged = await runGit(path, ['diff', '--cached', '--binary', '--', '.'], { signal, timeoutMs: 15_000 });
      requireGit(staged, 'Cannot read staged changes');
      hash.update(staged.stdout);
      for (const name of [...new Set(changed.stdout.split('\0').filter(Boolean))].sort()) {
        if (signal?.aborted) throw new OperationError('CANCELLED', 'Fingerprint cancelled.');
        hash.update(name);
        try { if ((await lstat(resolve(path, name))).isFile()) hash.update(await readFile(resolve(path, name))); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; hash.update('deleted'); }
      }
      return { value: `git-v2:${hash.digest('hex')}`, gitHead, clean: false };
    }
    const excluded = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output', '.tcg', 'graphify-out', 'tech-graphify-out']);
    const visit = async (directory: string): Promise<void> => {
      if (signal?.aborted) throw new OperationError('CANCELLED', 'Fingerprint cancelled.');
      const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (excluded.has(entry.name)) continue;
        const full = resolve(directory, entry.name);
        if (entry.isDirectory()) await visit(full);
        else if (entry.isFile()) hash.update(full.slice(path.length)).update(await readFile(full));
      }
    };
    await visit(path);
    return { value: `files-v2:${hash.digest('hex')}`, gitHead: null, clean: null };
  }
}
