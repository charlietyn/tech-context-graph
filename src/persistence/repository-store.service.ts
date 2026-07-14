import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RepositoryCandidate, RepositoryDiscoveryReport } from '../models/repository-discovery';
import { CatalogStatus, InspectionStatus, ScanRootRecord, StoredRepository, candidateToStored } from '../models/repository-state';
import { SqliteDatabaseService } from './sqlite-database.service';
import { canonicalGraphOutput, resolveGraphOutput } from '../services/graph-output-path';

interface RepositoryRow {
  id: string; repo_key: string; name: string; path: string; relative_path: string; role: string;
  category: string; technology: string; technology_label: string; confidence: number; markers_json: string;
  git_repository: number; ignore_profile: string; graph_output: string; enabled: number; catalog_status: string;
  discovered_at: string; updated_at: string; last_seen_at: string;
  inspection_status?: string; last_inspection_at?: string; graph_json_path?: string;
  node_count?: number; edge_count?: number; error_message?: string; source_fingerprint?: string;
}

@Injectable()
export class RepositoryStoreService {
  constructor(private readonly sqlite: SqliteDatabaseService) {}

  async saveDiscovery(workspaceRoot: string, report: RepositoryDiscoveryReport): Promise<void> {
    const now = report.generated_at;
    await this.sqlite.transaction(workspaceRoot, (db) => {
      const rootId = this.rootId(report.scan_root);
      db.run(`INSERT INTO scan_roots(id,path,enabled,max_depth,min_confidence,role,last_scanned_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)
        ON CONFLICT(path) DO UPDATE SET enabled=1,max_depth=excluded.max_depth,min_confidence=excluded.min_confidence,
          role=excluded.role,last_scanned_at=excluded.last_scanned_at,updated_at=excluded.updated_at`,
      [rootId, report.scan_root, 1, report.max_depth, report.min_confidence, report.role, now, now, now]);
      for (const candidate of report.candidates) this.upsertCandidate(db, candidate, now, 'DETECTED');
    });
  }

  async upsertRoot(workspaceRoot: string, values: { path: string; maxDepth: number; minConfidence: number; role: string; enabled?: boolean }): Promise<void> {
    const now = new Date().toISOString();
    const path = resolve(values.path);
    await this.sqlite.run(workspaceRoot, `INSERT INTO scan_roots(id,path,enabled,max_depth,min_confidence,role,last_scanned_at,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(path) DO UPDATE SET enabled=excluded.enabled,max_depth=excluded.max_depth,
        min_confidence=excluded.min_confidence,role=excluded.role,updated_at=excluded.updated_at`, [
      this.rootId(path), path, values.enabled === false ? 0 : 1, values.maxDepth, values.minConfidence,
      values.role, null, now, now,
    ]);
  }

  async upsertManual(workspaceRoot: string, values: {
    key: string; name?: string; path: string; role: string; category: string; technology: string;
    technologyLabel?: string; confidence?: number; markers?: string[]; gitRepository?: boolean;
    ignoreProfile?: string; graphOutput?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const candidate: RepositoryCandidate = {
      id: `REPO-${createHash('sha1').update(resolve(values.path).toLowerCase()).digest('hex').slice(0, 12).toUpperCase()}`,
      key: values.key,
      name: values.name ?? values.key,
      path: resolve(values.path),
      relative_path: '.',
      role: values.role,
      category: values.category,
      technology: values.technology,
      technology_label: values.technologyLabel ?? values.technology,
      confidence: values.confidence ?? 100,
      markers: values.markers ?? ['manual'],
      git_repository: values.gitRepository ?? existsSync(resolve(values.path, '.git')),
      ignore_profile: values.ignoreProfile ?? values.technology,
      graph_output: values.graphOutput ?? `./tech-graphify-out/technologies/${values.key}`,
      status: 'registered',
      warnings: [],
    };
    await this.sqlite.transaction(workspaceRoot, (db) => this.upsertCandidate(db, candidate, now, 'ACCEPTED'));
  }

  async list(workspaceRoot: string, options: {
    enabledOnly?: boolean;
    inspectedOnly?: boolean;
    catalogStatuses?: CatalogStatus[];
  } = {}): Promise<StoredRepository[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (options.enabledOnly !== false) conditions.push('r.enabled = 1');
    if (options.inspectedOnly) conditions.push("i.status = 'READY'");
    const statuses = options.catalogStatuses ?? ['ACCEPTED'];
    if (statuses.length > 0) {
      conditions.push(`r.catalog_status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.sqlite.all<RepositoryRow>(workspaceRoot, `
      SELECT r.*,
        i.status AS inspection_status,
        i.completed_at AS last_inspection_at,
        i.graph_json_path,
        i.node_count,
        i.edge_count,
        i.error_message,
        i.source_fingerprint
      FROM repositories r
      LEFT JOIN inspections i ON i.id = (
        SELECT i2.id FROM inspections i2 WHERE i2.repository_id = r.id ORDER BY i2.started_at DESC LIMIT 1
      )
      ${where}
      ORDER BY r.category, r.technology, r.repo_key
    `, params);
    return rows.map((row) => this.mapRow(row, workspaceRoot));
  }

  async detectedCandidates(workspaceRoot: string): Promise<StoredRepository[]> {
    return this.list(workspaceRoot, { enabledOnly: false, catalogStatuses: ['DETECTED'] });
  }

  async getById(workspaceRoot: string, id: string): Promise<StoredRepository | undefined> {
    return (await this.list(workspaceRoot, { enabledOnly: false, catalogStatuses: ['DETECTED', 'ACCEPTED', 'IGNORED', 'REJECTED', 'MISSING'] })).find((item) => item.id === id);
  }

  async getByKey(workspaceRoot: string, key: string): Promise<StoredRepository | undefined> {
    return (await this.list(workspaceRoot, { enabledOnly: false, catalogStatuses: ['DETECTED', 'ACCEPTED', 'IGNORED', 'REJECTED', 'MISSING'] })).find((item) => item.key === key);
  }

  async setCatalogStatus(workspaceRoot: string, repositoryIds: string[], status: CatalogStatus): Promise<void> {
    if (repositoryIds.length === 0) return;
    const placeholders = repositoryIds.map(() => '?').join(',');
    await this.sqlite.run(workspaceRoot, `UPDATE repositories SET catalog_status=?,enabled=?,updated_at=? WHERE id IN (${placeholders})`, [
      status, status === 'ACCEPTED' ? 1 : 0, new Date().toISOString(), ...repositoryIds,
    ]);
  }

  async roots(workspaceRoot: string): Promise<ScanRootRecord[]> {
    const rows = await this.sqlite.all<any>(workspaceRoot, 'SELECT * FROM scan_roots ORDER BY path');
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      enabled: Boolean(row.enabled),
      maxDepth: Number(row.max_depth),
      minConfidence: Number(row.min_confidence),
      role: row.role,
      lastScannedAt: row.last_scanned_at ?? undefined,
    }));
  }

  async setRootEnabled(workspaceRoot: string, id: string, enabled: boolean): Promise<void> {
    await this.sqlite.run(workspaceRoot, 'UPDATE scan_roots SET enabled=?,updated_at=? WHERE id=?', [enabled ? 1 : 0, new Date().toISOString(), id]);
  }

  async removeRoot(workspaceRoot: string, id: string): Promise<void> {
    await this.sqlite.run(workspaceRoot, 'DELETE FROM scan_roots WHERE id=?', [id]);
  }

  async beginInspection(workspaceRoot: string, repository: StoredRepository, fingerprint: string, commandText: string, logPath: string): Promise<string> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.sqlite.transaction(workspaceRoot, (db) => {
      db.run(`UPDATE inspections SET status='FAILED',completed_at=?,error_message=?
        WHERE repository_id=? AND status='RUNNING'`, [now, 'Inspection was interrupted or superseded by a newer run.', repository.id]);
      db.run(`INSERT INTO inspections(
        id,repository_id,status,started_at,graph_output,source_fingerprint,command_text,log_path
      ) VALUES(?,?,?,?,?,?,?,?)`, [id, repository.id, 'RUNNING', now, canonicalGraphOutput(repository.graphOutput), fingerprint, commandText, logPath]);
    });
    return id;
  }

  /**
   * Returns the latest inspection per repository together with the key/output needed to
   * validate it against disk. Used by reconciliation to heal inspections whose recorded
   * status no longer matches reality (e.g. RUNNING rows orphaned by a killed process, or
   * FAILED rows that predate the graphify-out path fix but whose graph.json is on disk).
   */
  async latestInspections(workspaceRoot: string): Promise<Array<{
    repositoryId: string; repoKey: string; inspectionId: string; status: string; graphOutput: string;
  }>> {
    const rows = await this.sqlite.all<{
      repository_id: string; repo_key: string; inspection_id: string; status: string; graph_output: string;
    }>(workspaceRoot, `
      SELECT i.repository_id, r.repo_key, i.id AS inspection_id, i.status, i.graph_output
      FROM inspections i
      JOIN repositories r ON r.id = i.repository_id
      WHERE i.id = (
        SELECT i2.id FROM inspections i2 WHERE i2.repository_id = i.repository_id ORDER BY i2.started_at DESC LIMIT 1
      )
    `);
    return rows.map((row) => ({
      repositoryId: row.repository_id,
      repoKey: row.repo_key,
      inspectionId: row.inspection_id,
      status: row.status,
      graphOutput: row.graph_output,
    }));
  }

  async completeInspection(workspaceRoot: string, inspectionId: string, values: {
    status: 'READY' | 'FAILED'; graphJsonPath?: string; graphifyVersion?: string;
    nodeCount?: number; edgeCount?: number; errorMessage?: string;
  }): Promise<void> {
    await this.sqlite.run(workspaceRoot, `UPDATE inspections SET status=?,completed_at=?,graph_json_path=?,graphify_version=?,
      node_count=?,edge_count=?,error_message=? WHERE id=?`, [
      values.status, new Date().toISOString(), values.graphJsonPath ?? null, values.graphifyVersion ?? null,
      values.nodeCount ?? null, values.edgeCount ?? null, values.errorMessage ?? null, inspectionId,
    ]);
  }

  async recordQuery(workspaceRoot: string, values: {
    repositoryId: string; action: string; input: string; output?: string; status: string; durationMs: number;
  }): Promise<void> {
    await this.sqlite.run(workspaceRoot, `INSERT INTO graph_queries(id,repository_id,action,input_text,output_text,status,created_at,duration_ms)
      VALUES(?,?,?,?,?,?,?,?)`, [randomUUID(), values.repositoryId, values.action, values.input, values.output ?? null,
      values.status, new Date().toISOString(), values.durationMs]);
  }

  async disable(workspaceRoot: string, repositoryId: string): Promise<void> {
    await this.sqlite.run(workspaceRoot, 'UPDATE repositories SET enabled=0,catalog_status=\'IGNORED\',updated_at=? WHERE id=?', [new Date().toISOString(), repositoryId]);
  }

  async updateClassification(workspaceRoot: string, repositoryId: string, values: {
    name: string;
    category: string;
    technology: string;
    technologyLabel: string;
    confidence: number;
    ignoreProfile: string;
    markers: string[];
  }): Promise<void> {
    await this.sqlite.run(workspaceRoot, `UPDATE repositories SET
      name=?,category=?,technology=?,technology_label=?,confidence=?,ignore_profile=?,markers_json=?,updated_at=?
      WHERE id=?`, [
      values.name,
      values.category,
      values.technology,
      values.technologyLabel,
      values.confidence,
      values.ignoreProfile,
      JSON.stringify(values.markers),
      new Date().toISOString(),
      repositoryId,
    ]);
  }

  async relocateGraphOutput(workspaceRoot: string, repositoryId: string, values: {
    graphOutput: string;
    oldAbsolutePath: string;
    newAbsolutePath: string;
  }): Promise<void> {
    await this.sqlite.transaction(workspaceRoot, (db) => {
      db.run('UPDATE repositories SET graph_output=?,updated_at=? WHERE id=?', [
        values.graphOutput,
        new Date().toISOString(),
        repositoryId,
      ]);
      db.run('UPDATE inspections SET graph_output=? WHERE repository_id=?', [values.graphOutput, repositoryId]);
      db.run(`UPDATE inspections SET graph_json_path=REPLACE(graph_json_path,?,?)
        WHERE repository_id=? AND graph_json_path IS NOT NULL`, [
        values.oldAbsolutePath,
        values.newAbsolutePath,
        repositoryId,
      ]);
    });
  }

  private upsertCandidate(db: any, candidate: RepositoryCandidate, now: string, newStatus: CatalogStatus): void {
    const item = candidateToStored(candidate, now);
    db.run(`INSERT INTO repositories(
      id,repo_key,name,path,relative_path,role,category,technology,technology_label,confidence,markers_json,
      git_repository,ignore_profile,graph_output,enabled,catalog_status,discovered_at,updated_at,last_seen_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(path) DO UPDATE SET
      repo_key=excluded.repo_key,name=excluded.name,relative_path=excluded.relative_path,role=excluded.role,
      category=excluded.category,technology=excluded.technology,technology_label=excluded.technology_label,
      confidence=excluded.confidence,markers_json=excluded.markers_json,git_repository=excluded.git_repository,
      ignore_profile=excluded.ignore_profile,
      graph_output=CASE WHEN repositories.catalog_status='ACCEPTED' THEN repositories.graph_output ELSE excluded.graph_output END,
      updated_at=excluded.updated_at,
      last_seen_at=excluded.last_seen_at`, [
      item.id, item.key, item.name, item.path, item.relativePath, item.role, item.category, item.technology,
      item.technologyLabel, item.confidence, JSON.stringify(item.markers), item.gitRepository ? 1 : 0,
      item.ignoreProfile, item.graphOutput, newStatus === 'ACCEPTED' ? 1 : 0, newStatus,
      item.discoveredAt, item.updatedAt, item.lastSeenAt,
    ]);
  }

  private mapRow(row: RepositoryRow, workspaceRoot: string): StoredRepository {
    let status = (row.inspection_status as InspectionStatus | undefined) ?? 'NEVER';
    let graphJsonPath = row.graph_json_path ?? undefined;
    if (status === 'READY' && (!graphJsonPath || !existsSync(graphJsonPath))) {
      const output = resolveGraphOutput(workspaceRoot, row.graph_output);
      const direct = resolve(output, 'graph.json');
      const nested = resolve(output, 'graphify-out', 'graph.json');
      graphJsonPath = existsSync(direct) ? direct : existsSync(nested) ? nested : graphJsonPath;
      if (!graphJsonPath || !existsSync(graphJsonPath)) status = 'MISSING';
    }
    return {
      id: row.id,
      key: row.repo_key,
      name: row.name,
      path: row.path,
      relativePath: row.relative_path,
      role: row.role,
      category: row.category,
      technology: row.technology,
      technologyLabel: row.technology_label,
      confidence: Number(row.confidence),
      markers: JSON.parse(row.markers_json || '[]'),
      gitRepository: Boolean(row.git_repository),
      ignoreProfile: row.ignore_profile,
      graphOutput: row.graph_output,
      enabled: Boolean(row.enabled),
      catalogStatus: (row.catalog_status || 'ACCEPTED') as CatalogStatus,
      discoveredAt: row.discovered_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
      inspectionStatus: status,
      lastInspectionAt: row.last_inspection_at ?? undefined,
      graphJsonPath,
      nodeCount: row.node_count ?? undefined,
      edgeCount: row.edge_count ?? undefined,
      lastError: row.error_message ?? undefined,
      sourceFingerprint: row.source_fingerprint ?? undefined,
    };
  }

  private rootId(path: string): string {
    return `ROOT-${createHash('sha1').update(resolve(path).toLowerCase()).digest('hex').slice(0, 12).toUpperCase()}`;
  }
}
