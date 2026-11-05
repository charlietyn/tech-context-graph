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

  describe('explicit decisions and registration', () => {
    let root: string;
    let sqlite: SqliteDatabaseService;
    let store: RepositoryStoreService;

    function report(status: 'candidate' | 'registered' = 'candidate'): RepositoryDiscoveryReport {
      return {
        generated_at: new Date().toISOString(), workspace_root: root, scan_root: root, role: 'technology', max_depth: 1,
        min_confidence: 60, visited_directories: 1, truncated: false, candidate_count: 1, registered_count: 0, skipped_count: 0,
        candidates: [{
          id: 'REPO-CAND-API', key: 'api', name: 'api', path: resolve(root, 'api'), relative_path: 'api', role: 'technology',
          category: 'backend', technology: 'nestjs', technology_label: 'NestJS', artifact_kind: 'application',
          package_ecosystem: 'npm', technology_constraints: [], classification_evidence: [], confidence: 90, markers: [],
          git_repository: false, ignore_profile: 'nestjs', graph_output: './tech-graphify-out/technologies/nestjs/api',
          status, warnings: [],
        }],
      };
    }

    beforeEach(() => {
      root = mkdtempSync(resolve(tmpdir(), 'tcg-catalog-decisions-'));
      mkdirSync(resolve(root, 'api'));
      sqlite = new SqliteDatabaseService();
      store = new RepositoryStoreService(sqlite);
    });
    afterEach(() => {
      sqlite.close();
      rmSync(root, { recursive: true, force: true });
    });

    it('organizes graphs when accepting explicit IDs and reports unknown ones as failures', async () => {
      await store.saveDiscovery(root, report());
      const organize = jest.fn().mockResolvedValue(0);
      const service = new CatalogReviewService(store, { organize } as unknown as TechnologyGraphService);

      const result = await service.apply(root, ['REPO-CAND-API', 'REPO-CAND-NOPE']);

      expect(result).toMatchObject({ accepted: 1, failed: 1 });
      expect(organize).toHaveBeenCalledWith(root, 'nestjs');
      expect(await store.getById(root, 'REPO-CAND-API')).toMatchObject({ catalogStatus: 'ACCEPTED', enabled: true });
    });

    it('revisits past decisions by ID, is idempotent and restores the prior status on failure', async () => {
      await store.saveDiscovery(root, report());
      const organize = jest.fn().mockResolvedValue(0);
      const service = new CatalogReviewService(store, { organize } as unknown as TechnologyGraphService);

      await service.apply(root, ['REPO-CAND-API']);
      expect((await service.apply(root, [], ['REPO-CAND-API'])).ignored).toBe(1);
      expect(await store.getById(root, 'REPO-CAND-API')).toMatchObject({ catalogStatus: 'IGNORED', enabled: false });

      organize.mockRejectedValueOnce(new Error('simulated relocation failure'));
      expect((await service.apply(root, ['REPO-CAND-API'])).failed).toBe(1);
      expect(await store.getById(root, 'REPO-CAND-API')).toMatchObject({ catalogStatus: 'IGNORED', enabled: false });

      expect((await service.apply(root, ['REPO-CAND-API'])).accepted).toBe(1);
      organize.mockClear();
      expect((await service.apply(root, ['REPO-CAND-API'])).accepted).toBe(1);
      expect(organize).not.toHaveBeenCalled();
    });

    it('accepts --apply registrations, including existing candidates, but never revives an ignored one', async () => {
      await store.saveDiscovery(root, report('registered'));
      expect(await store.getById(root, 'REPO-CAND-API')).toMatchObject({ catalogStatus: 'ACCEPTED', enabled: true });

      await store.setCatalogStatus(root, ['REPO-CAND-API'], 'DETECTED');
      await store.saveDiscovery(root, report());
      expect(await store.getById(root, 'REPO-CAND-API')).toMatchObject({ catalogStatus: 'DETECTED', enabled: false });
      await store.saveDiscovery(root, report('registered'));
      expect(await store.getById(root, 'REPO-CAND-API')).toMatchObject({ catalogStatus: 'ACCEPTED', enabled: true });

      await store.setCatalogStatus(root, ['REPO-CAND-API'], 'IGNORED');
      await store.saveDiscovery(root, report('registered'));
      expect(await store.getById(root, 'REPO-CAND-API')).toMatchObject({ catalogStatus: 'IGNORED', enabled: false });
    });

    it.each(['DETECTED', 'IGNORED'] as const)('accepts a %s path registered manually', async (status) => {
      await store.saveDiscovery(root, report());
      await store.setCatalogStatus(root, ['REPO-CAND-API'], status);

      await store.upsertManual(root, { key: 'api', path: resolve(root, 'api'), role: 'technology', category: 'backend', technology: 'nestjs' });

      expect(await store.getByKey(root, 'api')).toMatchObject({ catalogStatus: 'ACCEPTED', enabled: true });
    });
  });
});
