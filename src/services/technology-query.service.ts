import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { StoredRepository } from '../models/repository-state';
import {
  TechnologyContextError, TechnologyContextResultV1,
  TechnologyQueryRequestV1, normalizeTechnologyQuery,
} from '../models/technology-context-result';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { GraphifyCliService } from './graphify-cli.service';
import { PublishedGraphResolverService } from './published-graph-resolver.service';
import { OperationError } from './process-runner';

function sameRequestedVersion(version: string | undefined, requested: string): boolean {
  if (!version) return false;
  const requestedParts = requested.replace(/^[~^]/, '').replace(/\.x$/i, '').split('.');
  const actual = version.replace(/^[vV]/, '').split('.');
  return requestedParts.every((part, index) => part === 'x' || part === actual[index]);
}

/**
 * Avoid querying a family-wide aggregate that can mix incompatible framework majors.
 * An explicit exact/major version is mandatory; ambiguity is a hard failure.
 */
export function selectTechnologyCore(
  repositories: StoredRepository[], technology: string, version: string,
): StoredRepository {
  const matching = repositories.filter((r) =>
    r.enabled && r.catalogStatus === 'ACCEPTED' &&
    r.technology === technology && r.artifactKind === 'core' &&
    sameRequestedVersion(r.technologyVersion, version));
  if (matching.length !== 1) {
    throw new TechnologyContextError('VERSION_MISMATCH',
      matching.length === 0 ? 'No approved core matches the requested technology version.' :
        'Several approved cores match this version; disambiguate the catalog before querying.', 'MISSING');
  }
  return matching[0];
}

@Injectable()
export class TechnologyQueryService {
  constructor(
    private readonly store: RepositoryStoreService,
    private readonly resolver: PublishedGraphResolverService,
    private readonly graphify: GraphifyCliService,
  ) {}

  async run(workspace: string, input: Partial<TechnologyQueryRequestV1>): Promise<TechnologyContextResultV1> {
    const started = Date.now();
    const result: TechnologyContextResultV1 = {
      schemaVersion: '1.0', status: 'FAILED',
      technology: typeof input.technology === 'string' ? input.technology : '',
      requestedVersion: typeof input.versionConstraint === 'string' ? input.versionConstraint : '',
      sourceRefs: [], matches: [], warnings: [],
      correlationId: typeof input.correlationId === 'string' ? input.correlationId : undefined, queryDurationMs: 0,
    };
    try {
      const request = normalizeTechnologyQuery(input);
      const core = selectTechnologyCore(await this.store.list(workspace), request.technology, request.versionConstraint);
      result.resolvedVersion = core.technologyVersion;
      let published = await this.resolver.resolve(workspace, core);
      result.graphHash = published.graphHash;
      result.inspectionAt = published.publishedAt;
      result.freshnessCheckedAt = published.checkedAt;
      result.sourceRefs = [published.reference];
      if (request.graphRevision && request.graphRevision !== published.graphHash) {
        throw new TechnologyContextError('STALE_GRAPH', 'Pinned graph revision differs from the latest verified publication.', 'STALE');
      }
      // Graphify is only called after a verified, approved version-specific publication is found.
      const response = await this.graphify.queryPublished(
        published.graphPath, request.action, request.question, request.secondNode,
      );
      // Detect replacement or source edits while Graphify was running; do not return unverified answers.
      const after = await this.resolver.resolve(workspace, core);
      if (after.graphHash !== published.graphHash || after.reference.sourceFingerprint !== published.reference.sourceFingerprint ||
          after.reference.pointerInspectionId !== published.reference.pointerInspectionId) {
        throw new TechnologyContextError('SOURCE_CHANGED', 'Graph publication changed during the query.', 'STALE');
      }
      published = after;
      result.freshnessCheckedAt = published.checkedAt;
      if (response.output.trim()) {
        result.matches = [{ content: response.output, references: [0], confidence: 'INDEX' }];
        result.warnings.push('UNSTRUCTURED_GRAPHIFY_OUTPUT: repository-level provenance only; no verified file/line citation.');
      } else result.warnings.push('EMPTY_GRAPHIFY_QUERY_RESULT');
      result.status = 'READY';
    } catch (error) {
      const typed = error instanceof TechnologyContextError ? error :
        error instanceof OperationError
          ? new TechnologyContextError(
            error.code === 'TIMEOUT' ? 'TIMEOUT' : error.code === 'OUTPUT_LIMIT' ? 'OUTPUT_TOO_LARGE' :
              error.code === 'PROCESS_START' ? 'GRAPHIFY_UNAVAILABLE' : 'QUERY_FAILED',
            'The graph query could not complete (' + error.code + ').', 'FAILED', error.code === 'TIMEOUT')
          : new TechnologyContextError('QUERY_FAILED', 'The graph query could not complete.');
      result.status = typed.status;
      result.matches = [];
      if (typed.code === 'INTEGRITY_FAILED' || typed.code === 'SOURCE_CHANGED' || typed.code === 'STALE_GRAPH') result.sourceRefs = [];
      result.error = { code: typed.code, retryable: typed.retryable, message: typed.message };
    }
    result.queryDurationMs = Date.now() - started;
    return result;
  }
}
