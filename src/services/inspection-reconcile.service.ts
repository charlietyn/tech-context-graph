import { Injectable } from '@nestjs/common';
import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import { acquireLock } from './operation-lock';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { GraphifyCliService } from './graphify-cli.service';
import { resolveGraphOutput } from './graph-output-path';
import { RepositoryFingerprintService } from './repository-fingerprint.service';

export interface ReconcileEntry {
  repoKey: string;
  from: string;
  to: 'READY' | 'FAILED';
  detail: string;
}

export interface ReconcileReport {
  healed: ReconcileEntry[];
  interrupted: ReconcileEntry[];
  checked: number;
}

/** Recover only publications whose run ID, source fingerprint and content digest match.
 * The workspace lock prevents treating another controller's live run as interrupted.
 */
@Injectable()
export class InspectionReconcileService {
  constructor(
    private readonly store: RepositoryStoreService,
    private readonly graphify: GraphifyCliService,
    private readonly fingerprints: RepositoryFingerprintService = new RepositoryFingerprintService(),
  ) {}

  async reconcile(workspaceRoot: string): Promise<ReconcileReport> {
    const release = await acquireLock(resolve(workspaceRoot, '.tcg', 'update.lock'));
    try { return await this.reconcileLocked(workspaceRoot); } finally { await release(); }
  }

  private async reconcileLocked(workspaceRoot: string): Promise<ReconcileReport> {
    const latest = await this.store.latestInspections(workspaceRoot);
    const candidates = latest.filter((entry) => entry.status === 'RUNNING' || entry.status === 'FAILED');
    const report: ReconcileReport = { healed: [], interrupted: [], checked: candidates.length };
    if (candidates.length === 0) return report;

    for (const entry of candidates) {
      const output = resolveGraphOutput(workspaceRoot, entry.graphOutput);
      const publication = this.graphify.readPublication(output);
      const graphPath = this.resolveImmutableGraph(output, publication);
      const repository = await this.store.getById(workspaceRoot, entry.repositoryId);
      let sourceMatches = false;
      if (repository && publication?.fingerprint === entry.sourceFingerprint) {
        try {
          sourceMatches = await this.fingerprints.calculate(repository) === entry.sourceFingerprint;
        } catch { /* A source that cannot be verified must not be healed. */ }
      }
      const matching = graphPath && sourceMatches &&
        publication?.inspectionId === entry.inspectionId &&
        publication?.fingerprint === entry.sourceFingerprint &&
        /^[a-f0-9]{64}$/.test(publication.graphDigest ?? '') &&
        publication.graphDigest === createHash('sha256').update(await readFile(graphPath)).digest('hex');
      const validCounts = matching ? this.tryCount(graphPath) : undefined;

      if (graphPath && validCounts && validCounts.danglingEdges === 0) {
        await this.store.completeInspection(workspaceRoot, entry.inspectionId, {
          status: 'READY',
          graphJsonPath: graphPath,
          graphifyVersion: publication.graphifyVersion,
          nodeCount: validCounts.nodes,
          edgeCount: validCounts.edges,
        });
        report.healed.push({
          repoKey: entry.repoKey,
          from: entry.status,
          to: 'READY',
          detail: `${validCounts.nodes} nodes · ${validCounts.edges} edges recovered from disk`,
        });
        continue;
      }

      if (entry.status === 'RUNNING') {
        await this.store.completeInspection(workspaceRoot, entry.inspectionId, {
          status: 'FAILED',
          errorMessage: 'Inspection was interrupted before completion; no valid graph.json was found on disk.',
        });
        report.interrupted.push({
          repoKey: entry.repoKey,
          from: 'RUNNING',
          to: 'FAILED',
          detail: 'orphaned run settled as interrupted',
        });
      }
    }
    return report;
  }

  /** A reconciliation may only heal the exact immutable generation referenced by schema v2. */
  private resolveImmutableGraph(output: string, pointer: any): string | undefined {
    if (pointer?.schema !== 2 || typeof pointer.graph !== 'string' || isAbsolute(pointer.graph)) return undefined;
    const root = resolve(output, '.generations');
    const graphPath = resolve(output, pointer.graph);
    const inside = (base: string, target: string) => {
      const part = relative(base, target);
      return part.length > 0 && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
    };
    if (!inside(root, graphPath) || !existsSync(root) || !existsSync(graphPath)) return undefined;
    try {
      if (!inside(realpathSync(root), realpathSync(graphPath))) return undefined;
    } catch { return undefined; }
    return graphPath;
  }

  private tryCount(graphPath: string): { nodes: number; edges: number; danglingEdges: number } | undefined {
    try {
      const counts = this.graphify.graphCounts(graphPath);
      return counts.nodes > 0 ? counts : undefined;
    } catch {
      // A truncated or unparsable graph.json is not a usable graph; leave the row as-is.
      return undefined;
    }
  }
}
