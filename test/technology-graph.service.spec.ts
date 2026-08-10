import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { RepositoryStoreService } from '../src/persistence/repository-store.service';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';
import { TechnologyGraphService, TechnologyManifest } from '../src/services/technology-graph.service';

describe('TechnologyGraphService', () => {
  it('moves a legacy technology root into a versioned core through safe staging', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-technology-layout-'));
    const sqlite = new SqliteDatabaseService();
    const store = new RepositoryStoreService(sqlite);
    const service = new TechnologyGraphService(store);
    const sourceRepository = resolve(root, 'sources', 'laravel');
    mkdirSync(sourceRepository, { recursive: true });
    await store.upsertManual(root, {
      key: 'laravel-core-12',
      path: sourceRepository,
      role: 'technology',
      category: 'backend',
      technology: 'laravel',
      artifactKind: 'core',
      packageEcosystem: 'composer',
      packageName: 'laravel/laravel',
      technologyVersion: '12',
      graphOutput: './tech-graphify-out/technologies/laravel',
    });
    const legacyGraph = resolve(root, 'tech-graphify-out', 'technologies', 'laravel', 'graphify-out');
    mkdirSync(legacyGraph, { recursive: true });
    writeFileSync(resolve(legacyGraph, 'graph.json'), '{"nodes":[],"links":[]}');

    await expect(service.organize(root, 'laravel')).resolves.toBe(1);

    const memberGraph = resolve(
      root,
      'tech-graphify-out',
      'technologies',
      'laravel',
      'laravel-core-12',
      'graphify-out',
      'graph.json',
    );
    expect(existsSync(memberGraph)).toBe(true);
    const stored = await store.getByKey(root, 'laravel-core-12');
    expect(stored?.graphOutput).toBe('./tech-graphify-out/technologies/laravel/laravel-core-12');

    const manifest = JSON.parse(readFileSync(resolve(
      root,
      'tech-graphify-out',
      'technologies',
      'laravel',
      'technology.json',
    ), 'utf8')) as TechnologyManifest;
    expect(manifest).toMatchObject({
      schemaVersion: '2.0',
      id: 'laravel',
      coreStatus: 'present',
    });
    expect(manifest.members[0]).toMatchObject({
      key: 'laravel-core-12',
      kind: 'core',
      technologyVersion: '12',
      graphPath: 'laravel-core-12/graphify-out/graph.json',
    });

    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('adopts a legacy <technology>-<version> folder into the core member', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-versioned-legacy-layout-'));
    const sqlite = new SqliteDatabaseService();
    const store = new RepositoryStoreService(sqlite);
    const service = new TechnologyGraphService(store);
    const sourceRepository = resolve(root, 'sources', 'laravel-13');
    mkdirSync(sourceRepository, { recursive: true });
    await store.upsertManual(root, {
      key: 'laravel-core-13', path: sourceRepository, role: 'technology', category: 'backend',
      technology: 'laravel', artifactKind: 'core', technologyVersion: '13',
      graphOutput: './tech-graphify-out/technologies/laravel/laravel-core-13',
    });
    const legacyGraph = resolve(root, 'tech-graphify-out', 'technologies', 'laravel-13', 'graphify-out');
    mkdirSync(legacyGraph, { recursive: true });
    writeFileSync(resolve(legacyGraph, 'graph.json'), '{"nodes":[],"links":[]}');

    await expect(service.organize(root, 'laravel')).resolves.toBe(1);
    expect(existsSync(resolve(
      root, 'tech-graphify-out', 'technologies', 'laravel', 'laravel-core-13', 'graphify-out', 'graph.json',
    ))).toBe(true);
    expect(existsSync(resolve(root, 'tech-graphify-out', 'technologies', 'laravel-13'))).toBe(false);

    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  });
});
