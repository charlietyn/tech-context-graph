import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';
import { RepositoryStoreService } from '../src/persistence/repository-store.service';
import { SqliteMigrationService } from '../src/persistence/sqlite-migration.service';
import { TechnologyQueryService } from '../src/services/technology-query.service';

/** R-21: contract reads must not need the workspace lock that a running inspection holds. */
describe('R-21 lock-free catalog snapshot for contract reads', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(resolve(tmpdir(), 'tcg-snapshot-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  async function seeded() {
    const writer = new SqliteDatabaseService();
    const store = new RepositoryStoreService(writer);
    const source = resolve(root, 'src'); mkdirSync(source);
    await store.upsertManual(root, { key: 'nestjs-core-11', path: source, role: 'technology', category: 'backend',
      technology: 'nestjs', artifactKind: 'core', technologyVersion: '11.2.9' });
    return { writer, store };
  }

  it('reads the persisted catalog while another controller holds the workspace lock', async () => {
    const { writer } = await seeded(); // `writer` keeps the database lock open, like an inspection
    try {
      const reader = new SqliteDatabaseService();
      await expect(reader.open(root)).rejects.toMatchObject({ code: 'LOCKED' });
      const rows = await new RepositoryStoreService(reader).listSnapshot(root);
      expect(rows.map((row) => [row.key, row.technologyVersion])).toEqual([['nestjs-core-11', '11.2.9']]);
      // The query path reaches the version check instead of failing with LOCKED.
      const service = new TechnologyQueryService(new RepositoryStoreService(reader), {} as never, {} as never);
      const missing = await service.run(root, { technology: 'nestjs', versionConstraint: '12', action: 'query', question: 'x' });
      expect(missing).toMatchObject({ status: 'MISSING', error: { code: 'VERSION_MISMATCH' } });
    } finally { writer.close(); }
  });

  it('sees each committed write of the lock owner, never a partial one', async () => {
    const { writer, store } = await seeded();
    try {
      const reader = new RepositoryStoreService(new SqliteDatabaseService());
      expect(await reader.listSnapshot(root)).toHaveLength(1);
      const other = resolve(root, 'src-10'); mkdirSync(other);
      await store.upsertManual(root, { key: 'nestjs-core-10', path: other, role: 'technology', category: 'backend',
        technology: 'nestjs', artifactKind: 'core', technologyVersion: '10.4.22' });
      expect((await reader.listSnapshot(root)).map((row) => row.key).sort()).toEqual(['nestjs-core-10', 'nestjs-core-11']);
    } finally { writer.close(); }
  });

  it('never migrates or writes: an outdated catalog fails typed and stays byte-identical', async () => {
    const sql = await initSqlJs();
    const db = new sql.Database();
    db.run('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    db.run("INSERT INTO schema_migrations VALUES (?, '2026-01-01')", [SqliteMigrationService.LATEST_VERSION - 1]);
    const reader = new SqliteDatabaseService();
    const path = reader.getPath(root);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, Buffer.from(db.export()));
    const before = readFileSync(path);
    await expect(new RepositoryStoreService(reader).listSnapshot(root)).rejects.toMatchObject({ code: 'SCHEMA_OUTDATED' });
    expect(readFileSync(path).equals(before)).toBe(true);
    const service = new TechnologyQueryService(new RepositoryStoreService(reader), {} as never, {} as never);
    expect(await service.run(root, { technology: 'nestjs', versionConstraint: '11', action: 'query', question: 'x' }))
      .toMatchObject({ status: 'FAILED', error: { code: 'QUERY_FAILED', retryable: false } });
  });

  it('an uninitialised workspace has no cores (MISSING), and nothing is created', async () => {
    const reader = new SqliteDatabaseService();
    expect(await new RepositoryStoreService(reader).listSnapshot(root)).toEqual([]);
    expect(() => readFileSync(reader.getPath(root))).toThrow();
  });
});
