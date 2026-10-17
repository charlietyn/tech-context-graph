import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { RepositoryStoreService } from '../src/persistence/repository-store.service';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';
import { GraphifyCliService } from '../src/services/graphify-cli.service';

describe('managed graph output migration', () => {
  async function legacyWorkspace(key: string, technology = 'unknown') {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-output-migration-'));
    const sqlite = new SqliteDatabaseService();
    const store = new RepositoryStoreService(sqlite);
    const sourcePath = resolve(root, 'sources', key);
    mkdirSync(sourcePath, { recursive: true });
    await store.upsertManual(root, {
      key, path: sourcePath, role: 'application', category: 'subsystem', technology,
      graphOutput: `./tech-graphify-out/${key}`,
    });
    const repository = (await store.getByKey(root, key))!;
    const oldOutput = resolve(root, repository.graphOutput);
    const destination = resolve(root, 'tech-graphify-out', 'technologies', ...(technology === 'unknown' ? [key] : [technology, key]));
    return { root, sqlite, store, repository, oldOutput, destination };
  }

  it.each([
    ['go', false, false],
    ['driver-js', true, false],
    ['direct-output', true, true],
  ])('recovers %s and preserves inspection history after relocation', async (key, moved, direct) => {
    const { root, sqlite, store, repository, oldOutput, destination } = await legacyWorkspace(key);
    const suffix = direct ? ['graph.json'] : ['graphify-out', 'graph.json'];
    const physicalOutput = moved ? destination : oldOutput;
    mkdirSync(resolve(physicalOutput, ...suffix.slice(0, -1)), { recursive: true });
    const graph = '{"nodes":[{"id":"A"}],"links":[]}';
    writeFileSync(resolve(physicalOutput, ...suffix), graph);
    for (const status of ['FAILED', 'READY'] as const) {
      const id = await store.beginInspection(root, repository, 'fingerprint', 'original command', 'original.log');
      await store.completeInspection(root, id, {
        status, graphJsonPath: resolve(oldOutput, ...suffix), nodeCount: 1, edgeCount: 0,
      });
    }
    await sqlite.run(root, 'DELETE FROM schema_migrations WHERE version=9');
    sqlite.close();

    const reopened = new SqliteDatabaseService();
    const migratedStore = new RepositoryStoreService(reopened);
    const migrated = (await migratedStore.getByKey(root, key))!;
    const graphPath = resolve(destination, ...suffix);
    expect(migrated.graphOutput).toBe(`./tech-graphify-out/technologies/${key}`);
    expect(migrated.graphJsonPath).toBe(graphPath);
    expect(readFileSync(graphPath, 'utf8')).toBe(graph);
    expect(existsSync(oldOutput)).toBe(false);
    const history = await reopened.all<any>(root, 'SELECT * FROM inspections');
    expect(history.map((row) => row.status)).toEqual(['FAILED', 'READY']);
    expect(history.every((row) => row.graph_json_path === graphPath && row.graph_output === migrated.graphOutput
      && row.command_text === 'original command' && row.source_fingerprint === 'fingerprint')).toBe(true);

    const graphify = new GraphifyCliService(migratedStore, { calculate: () => 'fingerprint' } as never);
    const capture = jest.spyOn(graphify as any, 'captureGraphify').mockResolvedValue({ output: 'A', exitCode: 0, durationMs: 1 });
    await graphify.query(root, migrated, 'query', 'A');
    expect(capture).toHaveBeenCalledWith(['query', 'A', '--graph', graphPath]);
    jest.spyOn(graphify as any, 'spawnGraphify').mockImplementation(async (...args: any[]) => {
      expect(args[0]).toEqual(expect.arrayContaining(['--out', destination]));
    });
    jest.spyOn(graphify as any, 'estimateTrackedFiles').mockReturnValue(1);
    jest.spyOn(graphify, 'version').mockReturnValue('test');
    expect((await graphify.inspect(root, migrated)).graphPath).toBe(graphPath);
    expect(existsSync(oldOutput)).toBe(false);
    reopened.close();
    const again = new SqliteDatabaseService();
    expect((await new RepositoryStoreService(again).getByKey(root, key))?.graphOutput).toBe(migrated.graphOutput);
    again.close();
  });

  it('groups a recognized technology even when it has never been inspected', async () => {
    const { root, sqlite } = await legacyWorkspace('api', 'nestjs');
    await sqlite.run(root, 'DELETE FROM schema_migrations WHERE version=9');
    sqlite.close();
    const reopened = new SqliteDatabaseService();
    expect((await new RepositoryStoreService(reopened).getByKey(root, 'api'))?.graphOutput)
      .toBe('./tech-graphify-out/technologies/nestjs/api');
    reopened.close();
  });

  it('rejects conflicting folders on every open without changing either graph or SQLite', async () => {
    const { root, sqlite, oldOutput, destination } = await legacyWorkspace('go');
    for (const output of [oldOutput, destination]) {
      mkdirSync(output, { recursive: true });
      writeFileSync(resolve(output, 'graph.json'), output);
    }
    await sqlite.run(root, 'DELETE FROM schema_migrations WHERE version=9');
    sqlite.close();
    const before = readFileSync(resolve(root, '.tcg', 'state.sqlite'));
    const reopened = new SqliteDatabaseService();
    await expect(reopened.open(root)).rejects.toThrow('both source and destination');
    await expect(reopened.open(root)).rejects.toThrow('both source and destination');
    reopened.close();
    expect(readFileSync(resolve(root, '.tcg', 'state.sqlite'))).toEqual(before);
    for (const output of [oldOutput, destination]) expect(readFileSync(resolve(output, 'graph.json'), 'utf8')).toBe(output);
  });

  it('preserves explicit custom paths', async () => {
    const { root, sqlite, repository } = await legacyWorkspace('go');
    await sqlite.run(root, 'UPDATE repositories SET graph_output=? WHERE id=?', ['./custom/go', repository.id]);
    await sqlite.run(root, 'DELETE FROM schema_migrations WHERE version=9');
    sqlite.close();
    const reopened = new SqliteDatabaseService();
    expect((await new RepositoryStoreService(reopened).getByKey(root, 'go'))?.graphOutput).toBe('./custom/go');
    reopened.close();
  });
});
