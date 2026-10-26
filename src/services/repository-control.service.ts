import { Injectable } from '@nestjs/common';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { RepositoryDiscoveryReport } from '../models/repository-discovery';
import { StoredRepository } from '../models/repository-state';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { RepositoryDiscoveryService } from './repository-discovery.service';
import { RepositoryFingerprintService } from './repository-fingerprint.service';
import { resolveGraphOutput } from './graph-output-path';
import { TechnologyGraphService } from './technology-graph.service';
import { WorkspaceConfigService } from './config.service';

@Injectable()
export class RepositoryControlService {
  private readonly freshness = new Map<string, { sourcePath: string; fingerprint?: string; checkedAt: string; error?: string }>();
  private readonly refreshes = new Map<string, Promise<void>>();
  constructor(
    private readonly discovery: RepositoryDiscoveryService,
    private readonly store: RepositoryStoreService,
    private readonly fingerprints: RepositoryFingerprintService,
    private readonly technologyGraphs?: TechnologyGraphService,
    private readonly config?: WorkspaceConfigService,
  ) {}

  async scan(workspaceRoot: string, scanRoot: string, options: { maxDepth?: number; minConfidence?: number; role?: string } = {}): Promise<RepositoryDiscoveryReport> {
    const report = this.discovery.discover(workspaceRoot, scanRoot, options);
    await this.store.saveDiscovery(workspaceRoot, report);
    return report;
  }

  async list(workspaceRoot: string, inspectedOnly = false): Promise<StoredRepository[]> {
    const repositories = await this.store.list(workspaceRoot, { inspectedOnly });
    return repositories.map((repository) => {
      const cached = this.freshness.get(`${resolve(workspaceRoot)}:${repository.id}`);
      const current = cached?.sourcePath === repository.sourcePath ? cached.fingerprint : undefined;
      let status = repository.inspectionStatus;
      if (!existsSync(repository.sourcePath)) status = 'MISSING';
      else if (current && status === 'READY' && repository.sourceFingerprint && repository.sourceFingerprint !== current) status = 'STALE';
      return { ...repository, inspectionStatus: status, currentFingerprint: current, freshnessCheckedAt: cached?.checkedAt, freshnessError: cached?.error };
    });
  }

  refreshInBackground(workspaceRoot: string, signal?: AbortSignal): Promise<void> {
    const key = resolve(workspaceRoot);
    const existing = this.refreshes.get(key);
    if (existing) return existing;
    const task = (async () => {
      const rows = await this.store.list(workspaceRoot);
      let next = 0;
      await Promise.all([0, 1].map(async () => {
        while (next < rows.length && !signal?.aborted) {
          const row = rows[next++];
          const cacheKey = `${key}:${row.id}`;
          const previous = this.freshness.get(cacheKey);
          if (previous && Date.now() - Date.parse(previous.checkedAt) < 30_000) continue;
          try {
            const fingerprint = await this.fingerprints.calculate(row, signal);
            this.freshness.set(cacheKey, { sourcePath: row.sourcePath, fingerprint, checkedAt: new Date().toISOString() });
          } catch (error) {
            if (signal?.aborted) return;
            this.freshness.set(cacheKey, { sourcePath: row.sourcePath, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) });
          }
        }
      }));
    })().finally(() => this.refreshes.delete(key));
    this.refreshes.set(key, task);
    return task;
  }

  invalidate(workspaceRoot: string): void {
    for (const key of this.freshness.keys()) if (key.startsWith(`${resolve(workspaceRoot)}:`)) this.freshness.delete(key);
  }

  async get(workspaceRoot: string, id: string): Promise<StoredRepository> {
    const repository = await this.store.getById(workspaceRoot, id) ?? await this.store.getByKey(workspaceRoot, id);
    if (!repository) throw new Error(`Repository not found: ${id}`);
    try {
      const currentFingerprint = await this.fingerprints.calculate(repository);
      return { ...repository, currentFingerprint, freshnessCheckedAt: new Date().toISOString(),
        inspectionStatus: currentFingerprint === 'missing' ? 'MISSING'
          : repository.inspectionStatus === 'READY' && repository.sourceFingerprint && repository.sourceFingerprint !== currentFingerprint ? 'STALE' : repository.inspectionStatus };
    }
    catch (error) { return { ...repository, freshnessError: error instanceof Error ? error.message : String(error) }; }
  }

  async classify(workspaceRoot: string, id: string, values: {
    name?: string;
    category: string;
    technology: string;
    technologyLabel?: string;
    confidence?: number;
    ignoreProfile?: string;
  }): Promise<StoredRepository> {
    const repository = await this.get(workspaceRoot, id);
    const label = values.technologyLabel ?? values.technology;
    await this.store.updateClassification(workspaceRoot, repository.id, {
      name: values.name ?? label,
      category: values.category,
      technology: values.technology,
      technologyLabel: label,
      confidence: values.confidence ?? 100,
      ignoreProfile: values.ignoreProfile ?? values.technology,
      markers: [...new Set([...repository.markers, `manual:${values.technology}`])],
    });
    await this.technologyGraphs?.organize(workspaceRoot, values.technology);
    return this.get(workspaceRoot, repository.id);
  }

  async setSourcePath(workspaceRoot: string, id: string, sourcePathInput: string): Promise<StoredRepository> {
    const repository = await this.get(workspaceRoot, id);
    const sourcePath = resolve(sourcePathInput);
    if (!existsSync(sourcePath) || !statSync(sourcePath).isDirectory()) {
      throw new Error(`Source folder is not an existing directory: ${sourcePath}`);
    }
    if (resolve(repository.sourcePath) === sourcePath) return repository;
    await this.store.updateSourcePath(workspaceRoot, repository.id, sourcePath);
    this.config?.setProjectSourcePath(workspaceRoot, repository.key, sourcePath);
    return this.get(workspaceRoot, repository.id);
  }

  graphPath(workspaceRoot: string, repository: StoredRepository): string {
    if (repository.graphJsonPath && existsSync(repository.graphJsonPath)) return repository.graphJsonPath;
    const output = resolveGraphOutput(workspaceRoot, repository.graphOutput);
    const direct = resolve(output, 'graph.json');
    if (existsSync(direct)) return direct;
    return resolve(output, 'graphify-out', 'graph.json');
  }
}
