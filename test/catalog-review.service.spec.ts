import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { RepositoryDiscoveryReport } from '../src/models/repository-discovery';
import { RepositoryStoreService } from '../src/persistence/repository-store.service';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';
import { CatalogReviewService } from '../src/services/catalog-review.service';
import { TechnologyGraphService } from '../src/services/technology-graph.service';

describe('CatalogReviewService', () => {
  it('restores DETECTED when graph organization fails', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-catalog-review-'));
    const repositoryPath = resolve(root, 'source');
    mkdirSync(repositoryPath, { recursive: true });
    const sqlite = new SqliteDatabaseService();
    const store = new RepositoryStoreService(sqlite);
    const now = new Date().toISOString();
    const report: RepositoryDiscoveryReport = {
      generated_at: now,
      workspace_root: root,
      scan_root: repositoryPath,
      role: 'library',
      max_depth: 1,
      min_confidence: 60,
      visited_directories: 1,
      truncated: false,
      candidate_count: 1,
      registered_count: 0,
      skipped_count: 0,
      candidates: [{
        id: 'REPO-CAND-ONE',
        key: 'acme-laravel-lib',
        name: 'acme/laravel-lib',
        path: repositoryPath,
        relative_path: '.',
        role: 'library',
        category: 'library',
        technology: 'laravel',
        technology_label: 'Laravel',
        artifact_kind: 'library',
        package_ecosystem: 'composer',
        package_name: 'acme/laravel-lib',
        package_version: '1.0.0',
        technology_constraints: ['12'],
        classification_evidence: ['dependency:laravel/framework@^12'],
        confidence: 95,
        markers: ['composer:laravel/framework'],
        git_repository: true,
        ignore_profile: 'laravel',
        graph_output: './tech-graphify-out/technologies/laravel/acme-laravel-lib',
        status: 'candidate',
        warnings: [],
      }],
    };
    await store.saveDiscovery(root, report);
    const failingGraphs = {
      organize: async () => { throw new Error('simulated relocation failure'); },
    } as unknown as TechnologyGraphService;
    const service = new CatalogReviewService(store, failingGraphs);

    const result = await service.apply(root, ['REPO-CAND-ONE']);

    expect(result.failed).toBe(1);
    expect(result.items[0].error).toContain('simulated relocation failure');
    const stored = await store.getById(root, 'REPO-CAND-ONE');
    expect(stored).toMatchObject({ catalogStatus: 'DETECTED', enabled: false });

    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  });
});
