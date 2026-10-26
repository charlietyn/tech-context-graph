import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { StoredRepository } from '../models/repository-state';
import { GraphifyCliService } from './graphify-cli.service';
import { RepositoryGitService, RepositoryPullResult } from './repository-git.service';
import { TechnologyGraphService } from './technology-graph.service';
import { acquireLock } from './operation-lock';
import { OperationError } from './process-runner';
import { requireGit, runGit } from './git-access';

export interface UpdateOutcome {
  key: string; ok: boolean; status: 'UPDATED' | 'UNCHANGED' | 'BLOCKED' | 'FAILED' | 'CANCELLED';
  gitStatus: 'UPDATED' | 'UNCHANGED' | 'SKIPPED' | 'BLOCKED' | 'FAILED' | 'CANCELLED';
  graphStatus: 'UPDATED' | 'UNCHANGED' | 'PRESERVED' | 'UNAVAILABLE';
  durationMs: number; gitMs: number; graphMs: number; error?: string; errorCode?: string;
  logPath: string; notices: string[]; nodeCount?: number; edgeCount?: number; communityCount?: number; clustered?: boolean;
}
export interface UpdateReport {
  outcomes: UpdateOutcome[];
  aggregates: Array<{ technology: string; status: 'UPDATED' | 'UNCHANGED' | 'FAILED' | 'CANCELLED'; durationMs: number; error?: string }>;
  durationMs: number; logPath: string;
}
export interface UpdateOptions {
  pull?: boolean; force?: boolean; noCluster?: boolean; signal?: AbortSignal; gitConcurrency?: number;
  onProgress?: (message: string, completed: number, total: number) => void;
}

@Injectable()
export class RepositoryUpdateService {
  constructor(private readonly git: RepositoryGitService, private readonly graphify: GraphifyCliService,
    private readonly technologies: TechnologyGraphService) {}

  async run(workspaceRoot: string, repositories: StoredRepository[], options: UpdateOptions = {}): Promise<UpdateReport> {
    const started = Date.now();
    const id = randomUUID();
    const logRoot = resolve(workspaceRoot, '.tcg', 'logs');
    mkdirSync(logRoot, { recursive: true });
    const logPath = resolve(logRoot, `update-${id}.log`);
    const log = (message: string) => appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`);
    log('START');
    const report: UpdateReport = { outcomes: [], aggregates: [], durationMs: 0, logPath };
    const controller = new AbortController();
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    let release: (() => Promise<void>) | undefined;
    try {
      release = await acquireLock(resolve(workspaceRoot, '.tcg', 'update.lock'));
      const accepted = repositories.filter((r) => r.catalogStatus === 'ACCEPTED' && r.enabled);
      if (accepted.length !== repositories.length) throw new OperationError('NOT_ACCEPTED', 'Only enabled, accepted catalog repositories can be updated.');
      const pulls = new Map<string, { result?: RepositoryPullResult; error?: unknown; durationMs: number }>();
      const roots = new Map<string, string>();
      const groups = new Map<string, Array<{ root: string; repository: StoredRepository }>>();
      if (options.pull) {
        for (const repository of accepted) {
          try {
            const root = await this.git.root(repository.path, controller.signal);
            roots.set(repository.id, root);
            if (pulls.has(root)) continue;
            pulls.set(root, { durationMs: 0 });
            const common = resolve(root, requireGit(await runGit(root, ['rev-parse', '--git-common-dir'], { signal: controller.signal }), 'Cannot identify worktree'));
            const group = groups.get(common) ?? [];
            group.push({ root, repository }); groups.set(common, group);
          } catch (error) {
            roots.set(repository.id, repository.id);
            pulls.set(repository.id, { error, durationMs: 0 });
            log(`${repository.key} preflight: ${String(error)}`);
          }
        }
        const jobs = [...groups.values()]; let next = 0;
        const configured = options.gitConcurrency ?? Number(process.env.TCG_GIT_CONCURRENCY ?? 3);
        if (!Number.isInteger(configured) || configured < 1 || configured > 8) throw new Error('Git concurrency must be an integer between 1 and 8.');
        await Promise.all(Array.from({ length: Math.min(configured, jobs.length) }, async () => {
          while (next < jobs.length) {
            const group = jobs[next++];
            for (const { root, repository } of group) {
              const pullStarted = Date.now();
              options.onProgress?.(`${repository.key}: updating Git`, 0, accepted.length);
              try {
                const result = await this.git.pull(repository, { signal: controller.signal });
                pulls.set(root, { result, durationMs: Date.now() - pullStarted });
                log(`${repository.key} Git ${result.changed ? 'UPDATED' : 'UNCHANGED'} ${result.output}`);
              } catch (error) {
                pulls.set(root, { error, durationMs: Date.now() - pullStarted });
                log(`${repository.key} Git: ${String(error)}`);
              }
            }
          }
        }));
      }
      for (const repository of accepted) {
        const pull = pulls.get(roots.get(repository.id) ?? '');
        const row: UpdateOutcome = {
          key: repository.key, ok: false, status: 'FAILED', gitStatus: options.pull ? 'FAILED' : 'SKIPPED',
          graphStatus: repository.graphJsonPath ? 'PRESERVED' : 'UNAVAILABLE', durationMs: 0, gitMs: pull?.durationMs ?? 0,
          graphMs: 0, logPath, notices: pull?.result?.notices ?? [],
        };
        const graphStarted = Date.now();
        try {
          if (controller.signal.aborted) throw new OperationError('CANCELLED', 'Update cancelled.');
          if (pull?.error) throw pull.error;
          if (options.pull && !pull?.result) throw new Error('Git preflight did not produce a result.');
          row.gitStatus = pull?.result ? (pull.result.changed ? 'UPDATED' : 'UNCHANGED') : 'SKIPPED';
          const result = await this.graphify.inspect(workspaceRoot, repository, {
            ...options, signal: controller.signal, deferAggregate: true,
            onLine: (line) => log(`${repository.key}: ${line}`),
            onProgress: (event) => options.onProgress?.(`${repository.key}: ${event.message}`, report.outcomes.length, accepted.length),
          });
          row.ok = true; row.status = result.unchanged ? 'UNCHANGED' : 'UPDATED'; row.graphStatus = row.status;
          row.nodeCount = result.nodeCount; row.edgeCount = result.edgeCount; row.communityCount = result.communityCount; row.clustered = result.clustered;
          row.notices.push(...result.notices.map((notice) => notice.message));
        } catch (error) {
          const code = error instanceof OperationError ? error.code : 'FAILED';
          row.errorCode = code; row.error = error instanceof Error ? error.message : String(error);
          row.status = code === 'CANCELLED' ? 'CANCELLED' : ['LOCAL_CHANGES', 'OWNERSHIP', 'PERMISSION', 'DIVERGED', 'NO_UPSTREAM', 'DETACHED_HEAD', 'LOCKED'].includes(code) ? 'BLOCKED' : 'FAILED';
          if (pull?.error || controller.signal.aborted && row.gitStatus === 'FAILED') row.gitStatus = row.status as 'BLOCKED' | 'FAILED' | 'CANCELLED';
        }
        row.graphMs = Date.now() - graphStarted; row.durationMs = row.gitMs + row.graphMs;
        report.outcomes.push(row); log(JSON.stringify(row));
        options.onProgress?.(`${repository.key}: ${row.status}`, report.outcomes.length, accepted.length);
      }
      // Refresh also checks aggregate signatures, so a failed aggregate can be retried alone.
      const technologies = new Set(accepted.filter((r) => report.outcomes.some((o) => o.key === r.key && o.ok)).map((r) => r.technology));
      for (const technology of technologies) {
        const aggregateStarted = Date.now();
        options.onProgress?.(`${technology}: checking aggregate`, accepted.length, accepted.length);
        try {
          if (controller.signal.aborted) throw new OperationError('CANCELLED', 'Aggregate cancelled.');
          const result = await this.technologies.refresh(workspaceRoot, technology, controller.signal);
          report.aggregates.push({ technology, status: !result || result.unchanged ? 'UNCHANGED' : 'UPDATED', durationMs: Date.now() - aggregateStarted });
        } catch (error) {
          report.aggregates.push({ technology, status: controller.signal.aborted ? 'CANCELLED' : 'FAILED', durationMs: Date.now() - aggregateStarted, error: String(error) });
        }
      }
      return report;
    } catch (error) { log(`ERROR ${String(error)}`); throw error; }
    finally {
      report.durationMs = Date.now() - started;
      try {
        log(`END ${JSON.stringify(report)}`);
        const destination = resolve(logRoot, `update-${id}.json`);
        writeFileSync(`${destination}.tmp`, JSON.stringify(report, null, 2));
        renameSync(`${destination}.tmp`, destination);
      } finally {
        options.signal?.removeEventListener('abort', abort);
        process.removeListener('SIGINT', abort);
        process.removeListener('SIGTERM', abort);
        await release?.();
      }
    }
  }
}
