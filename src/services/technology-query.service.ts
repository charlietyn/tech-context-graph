import { Injectable } from '@nestjs/common';
import { StoredRepository } from '../models/repository-state';
import {
  TechnologyContextError, TechnologyContextResultV1,
  TechnologyQueryRequestV1, normalizeTechnologyQuery,
} from '../models/technology-context-result';
import { TechnologyGraphReferenceV1, technologyGraphReferenceFromResult } from '../models/technology-graph-reference';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { GraphifyCliService } from './graphify-cli.service';
import { PublishedGraphResolverService, VerifiedPublication } from './published-graph-resolver.service';
import { OperationError } from './process-runner';
import { sanitizeGraphifyOutput } from './query-output-sanitizer';

function sameRequestedVersion(version: string | undefined, requested: string): boolean {
  if (!version) return false;
  const requestedParts = requested.split('.');
  const actual = version.replace(/^[vV]/, '').split('.');
  return requestedParts.every((part, index) => part === actual[index]);
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

/**
 * Plan 28 C1 — CONTRACT-002 v1 READY is reproducible from its provenance: the technology source must be
 * a Git repository whose (source-path scoped) worktree is clean, so `repositoryCommit` alone identifies
 * the bytes Graphify indexed. A publication may still be valid for the TUI; it is just not v1 READY.
 */
export function assertReadyProvenance(published: VerifiedPublication): void {
  if (!published.reference.repositoryCommit) {
    throw new TechnologyContextError('INTEGRITY_FAILED',
      'READY requires a Git commit for the technology source; this source is not a Git repository.');
  }
  if (published.sourceClean !== true) {
    throw new TechnologyContextError('SOURCE_CHANGED',
      'The technology source has uncommitted or untracked changes; commit them and re-inspect before it can be READY.', 'STALE');
  }
}

function toTypedError(error: unknown): TechnologyContextError {
  if (error instanceof TechnologyContextError) return error;
  if (error instanceof OperationError && error.code === 'LOCKED') {
    // Another TCG controller (e.g. an inspection) owns the workspace; nothing was read, so retrying is safe.
    return new TechnologyContextError('QUERY_FAILED', 'The TCG workspace is busy with another operation (LOCKED); retry later.', 'FAILED', true);
  }
  if (error instanceof OperationError) {
    return new TechnologyContextError(
      error.code === 'TIMEOUT' ? 'TIMEOUT' : error.code === 'OUTPUT_LIMIT' ? 'OUTPUT_TOO_LARGE' :
        error.code === 'PROCESS_START' ? 'GRAPHIFY_UNAVAILABLE' : 'QUERY_FAILED',
      'The graph query could not complete (' + error.code + ').', 'FAILED', error.code === 'TIMEOUT');
  }
  return new TechnologyContextError('QUERY_FAILED', 'The graph query could not complete.');
}

@Injectable()
export class TechnologyQueryService {
  constructor(
    private readonly store: RepositoryStoreService,
    private readonly resolver: PublishedGraphResolverService,
    private readonly graphify: GraphifyCliService,
  ) {}

  private emptyResult(input: Partial<TechnologyQueryRequestV1>): TechnologyContextResultV1 {
    return {
      schemaVersion: '1.0', status: 'FAILED',
      technology: typeof input.technology === 'string' ? input.technology : '',
      requestedVersion: typeof input.versionConstraint === 'string' ? input.versionConstraint : '',
      sourceRefs: [], matches: [], warnings: [],
      correlationId: typeof input.correlationId === 'string' ? input.correlationId : undefined, queryDurationMs: 0,
    };
  }

  /** Every check a READY answer depends on, shared by `technology:query` and `technology:reference`. */
  private async verifiedPublication(
    workspace: string, request: TechnologyQueryRequestV1, result: TechnologyContextResultV1,
  ): Promise<{ core: StoredRepository; published: VerifiedPublication }> {
    const core = selectTechnologyCore(await this.store.list(workspace), request.technology, request.versionConstraint);
    result.resolvedVersion = core.technologyVersion;
    const published = await this.resolver.resolve(workspace, core);
    result.graphHash = published.graphHash;
    result.inspectionAt = published.publishedAt;
    result.freshnessCheckedAt = published.checkedAt;
    result.sourceRefs = [published.reference];
    if (request.graphRevision && request.graphRevision !== published.graphHash) {
      throw new TechnologyContextError('STALE_GRAPH', 'Pinned graph revision differs from the latest verified publication.', 'STALE');
    }
    assertReadyProvenance(published);
    // A Graphify upgrade may change the query semantics of a previously published index.
    const liveGraphify = await this.graphify.version(true);
    if (liveGraphify === 'unknown') {
      throw new TechnologyContextError('GRAPHIFY_UNAVAILABLE', 'The Graphify executable is not available.', 'FAILED', true);
    }
    if (liveGraphify !== published.reference.graphifyVersion) {
      throw new TechnologyContextError('STALE_GRAPH', 'Graphify version differs from the published index.', 'STALE');
    }
    return { core, published };
  }

  private fail(result: TechnologyContextResultV1, error: unknown): void {
    const typed = toTypedError(error);
    result.status = typed.status;
    result.matches = [];
    if (typed.code === 'INTEGRITY_FAILED' || typed.code === 'SOURCE_CHANGED' || typed.code === 'STALE_GRAPH') result.sourceRefs = [];
    result.error = { code: typed.code, retryable: typed.retryable, message: typed.message };
  }

  async run(workspace: string, input: Partial<TechnologyQueryRequestV1>): Promise<TechnologyContextResultV1> {
    const started = Date.now();
    const result = this.emptyResult(input);
    try {
      const request = normalizeTechnologyQuery(input);
      const { core, published } = await this.verifiedPublication(workspace, request, result);
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
      assertReadyProvenance(after);
      result.freshnessCheckedAt = after.checkedAt;
      if (response.output.trim()) {
        result.matches = [{ content: sanitizeGraphifyOutput(response.output, [workspace, core.path, core.sourcePath]), references: [0], confidence: 'INDEX' }];
        result.warnings.push('UNSTRUCTURED_GRAPHIFY_OUTPUT: sanitized untrusted content; repository-level provenance only; no verified file/line citation.');
      } else result.warnings.push('EMPTY_GRAPHIFY_QUERY_RESULT');
      result.status = 'READY';
    } catch (error) {
      this.fail(result, error);
    }
    result.queryDurationMs = Date.now() - started;
    return result;
  }

  /**
   * CONTRACT-003: verify the latest publication exactly as a query would, without running Graphify.
   * The question is irrelevant here, so a fixed placeholder satisfies request normalization.
   */
  async reference(workspace: string, input: Partial<TechnologyQueryRequestV1>): Promise<TechnologyGraphReferenceV1> {
    const result = this.emptyResult(input);
    try {
      const request = normalizeTechnologyQuery({ ...input, action: 'query', question: 'reference' });
      await this.verifiedPublication(workspace, request, result);
      result.status = 'READY';
    } catch (error) {
      this.fail(result, error);
    }
    return technologyGraphReferenceFromResult(result);
  }
}
