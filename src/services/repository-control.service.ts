import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RepositoryDiscoveryReport } from '../models/repository-discovery';
import { StoredRepository } from '../models/repository-state';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { RepositoryDiscoveryService } from './repository-discovery.service';
import { RepositoryFingerprintService } from './repository-fingerprint.service';
import { resolveGraphOutput } from './graph-output-path';
import { TechnologyGraphService } from './technology-graph.service';

@Injectable()
export class RepositoryControlService {
  constructor(
    private readonly discovery: RepositoryDiscoveryService,
    private readonly store: RepositoryStoreService,
    private readonly fingerprints: RepositoryFingerprintService,
    private readonly technologyGraphs?: TechnologyGraphService,
  ) {}

  async scan(workspaceRoot: string, scanRoot: string, options: { maxDepth?: number; minConfidence?: number; role?: string } = {}): Promise<RepositoryDiscoveryReport> {
    const report = this.discovery.discover(workspaceRoot, scanRoot, options);
    await this.store.saveDiscovery(workspaceRoot, report);
    return report;
  }

  async list(workspaceRoot: string, inspectedOnly = false): Promise<StoredRepository[]> {
    const repositories = await this.store.list(workspaceRoot, { inspectedOnly });
    return repositories.map((repository) => {
      const current = this.fingerprints.calculate(repository);
      let status = repository.inspectionStatus;
      if (!existsSync(repository.path)) status = 'MISSING';
      else if (status === 'READY' && repository.sourceFingerprint && repository.sourceFingerprint !== current) status = 'STALE';
      return { ...repository, inspectionStatus: status, currentFingerprint: current };
    });
  }

  async get(workspaceRoot: string, id: string): Promise<StoredRepository> {
    const repository = (await this.list(workspaceRoot)).find((item) => item.id === id || item.key === id);
    if (!repository) throw new Error(`Repository not found: ${id}`);
    return repository;
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

  graphPath(workspaceRoot: string, repository: StoredRepository): string {
    if (repository.graphJsonPath && existsSync(repository.graphJsonPath)) return repository.graphJsonPath;
    const output = resolveGraphOutput(workspaceRoot, repository.graphOutput);
    const direct = resolve(output, 'graph.json');
    if (existsSync(direct)) return direct;
    return resolve(output, 'graphify-out', 'graph.json');
  }
}
