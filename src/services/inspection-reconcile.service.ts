import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
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

/**
 * Reconciles recorded inspection state with what is actually on disk.
 *
 * Under the single local controller invariant (one process at a time, see
 * ARCHITECTURE_ANALYSIS.md) any `RUNNING` inspection observed at startup is by definition
 * orphaned — no other process could still own it. And several `FAILED` rows predate the
 * `graphify-out/graph.json` path fix: Graphify wrote a perfectly valid graph, but the old
 * control plane looked in the wrong directory and recorded a false failure.
 *
 * This service walks the latest inspection of every repository and, when a valid graph.json
 * exists on disk, promotes the row to `READY` with freshly counted nodes/edges. An orphaned
 * `RUNNING` inspection with no usable graph is settled as `FAILED (interrupted)` so the
 * catalog stops claiming a scan is still in progress.
 */
@Injectable()
export class InspectionReconcileService {
  constructor(
    private readonly store: RepositoryStoreService,
    private readonly graphify: GraphifyCliService,
  ) {}

  async reconcile(workspaceRoot: string): Promise<ReconcileReport> {
    const latest = await this.store.latestInspections(workspaceRoot);
    const candidates = latest.filter((entry) => entry.status === 'RUNNING' || entry.status === 'FAILED');
    const report: ReconcileReport = { healed: [], interrupted: [], checked: candidates.length };
    if (candidates.length === 0) return report;

    const graphifyVersion = this.graphify.version();
    for (const entry of candidates) {
      const output = resolveGraphOutput(workspaceRoot, entry.graphOutput);
      const graphPath = this.graphify.resolveGraphPath(output);
      const validCounts = existsSync(graphPath) ? this.tryCount(graphPath) : undefined;

      if (validCounts) {
        if (validCounts.danglingEdges > 0) {
          this.graphify.removeDanglingEdges(graphPath);
          const repaired = this.tryCount(graphPath);
          if (repaired) { validCounts.nodes = repaired.nodes; validCounts.edges = repaired.edges; }
        }
        await this.store.completeInspection(workspaceRoot, entry.inspectionId, {
          status: 'READY',
          graphJsonPath: graphPath,
          graphifyVersion,
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
