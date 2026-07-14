import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';
import { RepositoryStoreService } from '../src/persistence/repository-store.service';
import { KitPathService } from '../src/services/kit-path.service';
import { TechnologyCatalogService } from '../src/services/technology-catalog.service';
import { WorkspaceConfigService } from '../src/services/config.service';
import { RepositoryDiscoveryService } from '../src/services/repository-discovery.service';
import { RepositoryFingerprintService } from '../src/services/repository-fingerprint.service';
import { RepositoryControlService } from '../src/services/repository-control.service';

describe('SQLite repository catalog', () => {
  it('stores manual repositories with a real SQLite file', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-db-'));
    const sqlite = new SqliteDatabaseService();
    const store = new RepositoryStoreService(sqlite);
    const repositoryPath = resolve(root, 'tech', 'api');
    mkdirSync(repositoryPath, { recursive: true });
    await store.upsertManual(root, {
      key: 'api', path: repositoryPath, role: 'technology', category: 'backend', technology: 'nestjs',
    });
    const items = await store.list(root);
    expect(items).toHaveLength(1);
    expect(items[0].inspectionStatus).toBe('NEVER');
    expect(existsSync(resolve(root, '.tcg', 'state.sqlite'))).toBe(true);
    sqlite.close();
  });

  it('discovers NestJS and Laravel and persists both', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-discovery-'));
    const tree = resolve(root, 'Tech');
    const nest = resolve(tree, 'Backend', 'NestJS', 'nest');
    const laravel = resolve(tree, 'Backend', 'Laravel', '13');
    mkdirSync(nest, { recursive: true });
    mkdirSync(laravel, { recursive: true });
    writeFileSync(resolve(nest, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^11' } }));
    writeFileSync(resolve(nest, 'nest-cli.json'), '{}');
    writeFileSync(resolve(laravel, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^13' } }));
    writeFileSync(resolve(laravel, 'artisan'), '');

    process.env.TCG_KIT_ROOT = resolve(__dirname, '..');
    const config = new WorkspaceConfigService();
    const discovery = new RepositoryDiscoveryService(new TechnologyCatalogService(new KitPathService()), config);
    const sqlite = new SqliteDatabaseService();
    const store = new RepositoryStoreService(sqlite);
    const control = new RepositoryControlService(discovery, store, new RepositoryFingerprintService());
    const report = await control.scan(root, tree, { maxDepth: 6 });
    const detected = await store.detectedCandidates(root);
    expect(report.candidate_count).toBe(2);
    expect(detected.map((item) => item.technology).sort()).toEqual(['laravel', 'nestjs']);
    expect(detected.every((item) => item.catalogStatus === 'DETECTED')).toBe(true);
    await store.setCatalogStatus(root, detected.map((item) => item.id), 'ACCEPTED');
    const items = await control.list(root);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.inspectionStatus === 'NEVER')).toBe(true);
    sqlite.close();
  });
});
