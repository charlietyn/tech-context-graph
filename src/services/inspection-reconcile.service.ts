import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { acquireLock } from './operation-lock';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { GraphifyCliService } from './graphify-cli.service';
import { resolveGraphOutput } from './graph-output-path';

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
      const graphPath = this.graphify.resolveGraphPath(output);
      const publication = this.graphify.readPublication(output);
      const matching = publication?.inspectionId === entry.inspectionId && publication.fingerprint === entry.sourceFingerprint
        && existsSync(graphPath) && publication.graphDigest === createHash('sha256').update(await readFile(graphPath)).digest('hex');
      const validCounts = matching ? this.tryCount(graphPath) : undefined;

      if (validCounts && validCounts.danglingEdges === 0) {
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
