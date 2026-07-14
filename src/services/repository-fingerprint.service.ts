import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { StoredRepository } from '../models/repository-state';

@Injectable()
export class RepositoryFingerprintService {
  calculate(repository: StoredRepository): string {
    if (!existsSync(repository.path)) return 'missing';
    const git = this.gitFingerprint(repository.path);
    if (git) return git;
    const summary = this.directorySummary(repository.path);
    return `files:${createHash('sha256').update(summary).digest('hex')}`;
  }

  private gitFingerprint(path: string): string | undefined {
    const head = spawnSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8', shell: false });
    if (head.status !== 0) return undefined;
    const status = spawnSync('git', ['-C', path, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', shell: false });
    const dirty = status.status === 0 && status.stdout.trim() ? createHash('sha1').update(status.stdout).digest('hex').slice(0, 12) : 'clean';
    return `git:${head.stdout.trim()}:${dirty}`;
  }

  private directorySummary(root: string): string {
    const excluded = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output', '.tcg', 'graphify-out', 'tech-graphify-out']);
    const stack = [root];
    const records: string[] = [];
    let visited = 0;
    while (stack.length && visited < 20_000) {
      const current = stack.pop()!;
      let entries;
      try { entries = readdirSync(current, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (excluded.has(entry.name)) continue;
        const full = resolve(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) {
          visited += 1;
          try {
            const stat = statSync(full);
            records.push(`${full.slice(root.length)}:${stat.size}:${Math.trunc(stat.mtimeMs)}`);
          } catch { /* ignore unreadable file */ }
        }
      }
    }
    return records.sort().join('\n');
  }
}
