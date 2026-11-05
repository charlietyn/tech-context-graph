import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { StoredRepository } from '../models/repository-state';
import { TechnologyContextError, TechnologySourceRefV1 } from '../models/technology-context-result';
import { resolveGraphOutput } from './graph-output-path';
import { RepositoryFingerprintService } from './repository-fingerprint.service';
import { GraphifyCliService } from './graphify-cli.service';
import { gitRoot, runGit } from './git-access';

export interface VerifiedPublication {
  graphPath: string;
  graphHash: string;
  reference: TechnologySourceRefV1;
  publishedAt: string;
  checkedAt: string;
}

function contained(root: string, path: string): boolean {
  const value = relative(root, path);
  return value.length > 0 && value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value);
}

/** Fail-closed, immutable graph publication reader. Legacy unverified graph.json is deliberately excluded. */
@Injectable()
export class PublishedGraphResolverService {
  constructor(
    private readonly fingerprints: RepositoryFingerprintService,
    private readonly graphify: GraphifyCliService,
  ) {}

  async resolve(workspace: string, repository: StoredRepository): Promise<VerifiedPublication> {
    if (!repository.enabled || repository.catalogStatus !== 'ACCEPTED') {
      throw new TechnologyContextError('GRAPH_MISSING', 'Repository is not approved.', 'MISSING');
    }
    const workspaceRoot = realpathSync(workspace);
    const output = resolveGraphOutput(workspace, repository.graphOutput);
    if (!existsSync(output)) throw new TechnologyContextError('GRAPH_MISSING', 'Published graph output does not exist.', 'MISSING');
    const realOutput = realpathSync(output);
    if (!contained(workspaceRoot, realOutput)) {
      throw new TechnologyContextError('INTEGRITY_FAILED', 'Published graph output is outside the approved workspace.');
    }
    const pointerPath = resolve(realOutput, 'tcg-current.json');
    if (!existsSync(pointerPath) || !contained(realOutput, realpathSync(pointerPath))) {
      throw new TechnologyContextError('GRAPH_MISSING', 'No trusted publication pointer is available.', 'MISSING');
    }
    let pointer: Record<string, unknown>;
    try { pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as Record<string, unknown>; }
    catch { throw new TechnologyContextError('INTEGRITY_FAILED', 'Publication metadata is malformed.'); }
    if (pointer.schema !== 2 || typeof pointer.graph !== 'string' || isAbsolute(pointer.graph) ||
        typeof pointer.graphDigest !== 'string' || !/^[a-f0-9]{64}$/.test(pointer.graphDigest) ||
        typeof pointer.inspectionId !== 'string' || !pointer.inspectionId ||
        typeof pointer.fingerprint !== 'string' || !pointer.fingerprint ||
        typeof pointer.graphifyVersion !== 'string' || !pointer.graphifyVersion ||
        typeof pointer.publishedAt !== 'string' || !Number.isFinite(Date.parse(pointer.publishedAt))) {
      throw new TechnologyContextError('INTEGRITY_FAILED', 'Publication metadata is incomplete or unversioned.');
    }
    const graphPath = resolve(realOutput, pointer.graph);
    const generations = resolve(realOutput, '.generations');
    if (!contained(generations, graphPath) || !existsSync(graphPath) ||
        !contained(realOutput, realpathSync(graphPath)) ||
        !contained(realpathSync(generations), realpathSync(graphPath))) {
      throw new TechnologyContextError('INTEGRITY_FAILED', 'Published graph escaped its immutable generation.');
    }
    const digest = createHash('sha256').update(readFileSync(graphPath)).digest('hex');
    if (digest !== pointer.graphDigest) {
      throw new TechnologyContextError('INTEGRITY_FAILED', 'Published graph SHA-256 does not match its pointer.');
    }
    try {
      const counts = this.graphify.graphCounts(graphPath);
      if (counts.danglingEdges || counts.nodes === 0) throw new Error('Invalid graph topology.');
    } catch {
      throw new TechnologyContextError('INTEGRITY_FAILED', 'Published graph topology is invalid.');
    }
    if (repository.inspectionStatus !== 'READY' || repository.lastInspectionId !== pointer.inspectionId ||
        repository.sourceFingerprint !== pointer.fingerprint ||
        (repository.graphJsonPath && existsSync(repository.graphJsonPath) &&
         realpathSync(repository.graphJsonPath) !== realpathSync(graphPath))) {
      throw new TechnologyContextError('STALE_GRAPH', 'Latest inspection is not an approved READY publication.', 'STALE');
    }
    let currentFingerprint: string;
    try { currentFingerprint = await this.fingerprints.calculate(repository); }
    catch { throw new TechnologyContextError('SOURCE_CHANGED', 'Source fingerprint could not be verified.', 'STALE'); }
    if (currentFingerprint !== pointer.fingerprint) {
      throw new TechnologyContextError('STALE_GRAPH', 'Repository has changed since the published inspection.', 'STALE');
    }
    let repositoryCommit: string | null = null;
    if (currentFingerprint.startsWith('git-v2:')) {
      if (!gitRoot(repository.sourcePath)) {
        throw new TechnologyContextError('SOURCE_CHANGED', 'Git fingerprint has no valid repository root.', 'STALE');
      }
      const result = await runGit(repository.sourcePath, ['rev-parse', 'HEAD'], { timeoutMs: 15_000 });
      if (result.exitCode !== 0 || !/^[a-f0-9]{40,64}$/.test(result.stdout.trim())) {
        throw new TechnologyContextError('SOURCE_CHANGED', 'Git revision could not be verified.', 'STALE');
      }
      repositoryCommit = result.stdout.trim();
    }
    return {
      graphPath, graphHash: digest, publishedAt: pointer.publishedAt,
      checkedAt: new Date().toISOString(),
      reference: {
        repositoryId: repository.id, repositoryKey: repository.key, repositoryCommit,
        sourceFingerprint: pointer.fingerprint, graphDigestSha256: digest,
        graphifyVersion: pointer.graphifyVersion, publishedAt: pointer.publishedAt,
        pointerInspectionId: pointer.inspectionId,
      },
    };
  }
}
