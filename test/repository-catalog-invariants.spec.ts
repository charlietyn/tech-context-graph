import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { RepositoryStoreService } from '../src/persistence/repository-store.service';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';
import { RepositoryDiscoveryReport } from '../src/models/repository-discovery';

describe('Repository catalog accepted-state invariants', () => {
  it('preserves human choices and assigns deterministic keys to colliding new paths', async () => {
    const workspace = mkdtempSync(resolve(tmpdir(), 'tcg-catalog-invariant-'));
    const a = resolve(workspace, 'a'); const b = resolve(workspace, 'b');
    mkdirSync(a); mkdirSync(b);
    const sqlite = new SqliteDatabaseService();
    const store = new RepositoryStoreService(sqlite);
    try {
      await store.upsertManual(workspace, {
        key: 'same', path: a, role: 'technology', category: 'backend', technology: 'manualtech',
      });
      const candidate = (path: string, id: string) => ({
        id, key: 'same', name: 'detect', path, relative_path: '.', role: 'library',
        category: 'library', technology: 'nestjs', technology_label: 'NestJS',
        artifact_kind: 'library' as const, package_ecosystem: 'npm' as const,
        technology_constraints: [], classification_evidence: [], confidence: 95, markers: [],
        git_repository: false, ignore_profile: 'nestjs',
        graph_output: './tech-graphify-out/technologies/nestjs/same',
        status: 'candidate' as const, warnings: [],
      });
      const report: RepositoryDiscoveryReport = {
        generated_at: new Date().toISOString(), workspace_root: workspace,
        scan_root: workspace, role: 'technology', max_depth: 1, min_confidence: 60,
        visited_directories: 2, truncated: false, candidate_count: 2,
        registered_count: 0, skipped_count: 0,
        candidates: [candidate(a, 'id-a'), candidate(b, 'id-b')],
      };
      await store.saveDiscovery(workspace, report);
      expect(await store.getByKey(workspace, 'same')).toMatchObject({
        technology: 'manualtech', category: 'backend', catalogStatus: 'ACCEPTED',
      });
      const detected = await store.detectedCandidates(workspace);
      expect(detected).toHaveLength(1);
      expect(detected[0].key).toMatch(/^same-[a-f0-9]{8}$/);
      const key = detected[0].key;
      await store.saveDiscovery(workspace, report);
      expect((await store.detectedCandidates(workspace))[0].key).toBe(key);
      expect((await store.getByKey(workspace, 'same'))?.technology).toBe('manualtech');
    } finally { sqlite.close(); }
  });
});
