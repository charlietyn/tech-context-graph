import { Injectable } from '@nestjs/common';
import { CatalogStatus, StoredRepository } from '../models/repository-state';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { TechnologyGraphService } from './technology-graph.service';

export interface CatalogReviewItemResult {
  id: string;
  key: string;
  status: 'accepted' | 'ignored' | 'failed';
  error?: string;
}

export interface CatalogReviewResult {
  items: CatalogReviewItemResult[];
  accepted: number;
  ignored: number;
  failed: number;
}

@Injectable()
export class CatalogReviewService {
  constructor(
    private readonly store: RepositoryStoreService,
    private readonly technologyGraphs?: TechnologyGraphService,
  ) {}

  listDetected(workspaceRoot: string): Promise<StoredRepository[]> {
    return this.store.detectedCandidates(workspaceRoot);
  }

  async apply(
    workspaceRoot: string,
    acceptedIds: string[],
    ignoredIds: string[] = [],
    onItem?: (result: CatalogReviewItemResult, completed: number, total: number) => void,
  ): Promise<CatalogReviewResult> {
    const candidates = await this.store.detectedCandidates(workspaceRoot);
    const byId = new Map(candidates.map((item) => [item.id, item]));
    const requested = [
      ...acceptedIds.map((id) => ({ id, status: 'ACCEPTED' as const })),
      ...ignoredIds.map((id) => ({ id, status: 'IGNORED' as const })),
    ];
    const items: CatalogReviewItemResult[] = [];
    for (const request of requested) {
      const candidate = byId.get(request.id);
      let result: CatalogReviewItemResult;
      if (!candidate) {
        result = { id: request.id, key: request.id, status: 'failed', error: 'Candidate no longer exists or was already reviewed.' };
      } else {
        try {
          await this.store.setCatalogStatus(workspaceRoot, [request.id], request.status);
          if (request.status === 'ACCEPTED') {
            try {
              await this.technologyGraphs?.organize(workspaceRoot, candidate.technology);
            } catch (error) {
              await this.store.setCatalogStatus(workspaceRoot, [request.id], 'DETECTED');
              throw error;
            }
          }
          result = { id: request.id, key: candidate.key, status: request.status === 'ACCEPTED' ? 'accepted' : 'ignored' };
        } catch (error) {
          result = { id: request.id, key: candidate.key, status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
      }
      items.push(result);
      onItem?.(result, items.length, requested.length);
    }
    return {
      items,
      accepted: items.filter((item) => item.status === 'accepted').length,
      ignored: items.filter((item) => item.status === 'ignored').length,
      failed: items.filter((item) => item.status === 'failed').length,
    };
  }

  setStatus(workspaceRoot: string, ids: string[], status: CatalogStatus): Promise<void> {
    return this.store.setCatalogStatus(workspaceRoot, ids, status);
  }
}
