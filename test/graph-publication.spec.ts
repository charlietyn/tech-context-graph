import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';
import { RepositoryStoreService } from '../src/persistence/repository-store.service';
import { GraphifyCliService } from '../src/services/graphify-cli.service';
import { RepositoryFingerprintService } from '../src/services/repository-fingerprint.service';
import { InspectionReconcileService } from '../src/services/inspection-reconcile.service';
import { TechnologyGraphService } from '../src/services/technology-graph.service';

async function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'tcg-publication-'));
  const source = resolve(root, 'source'); mkdirSync(source); writeFileSync(resolve(source, 'code.ts'), 'export const value = 1;');
  const sqlite = new SqliteDatabaseService(); const store = new RepositoryStoreService(sqlite);
  await store.upsertManual(root, { key: 'core', path: source, role: 'technology', category: 'backend', technology: 'test' });
  const graphify = new GraphifyCliService(store, new RepositoryFingerprintService());
  jest.spyOn(graphify, 'version').mockResolvedValue('fixture-v1');
  (graphify as any).helpCache = Promise.resolve('extract --out incremental');
  jest.spyOn(graphify as any, 'estimateTrackedFiles').mockResolvedValue(1);
  const extraction = jest.spyOn(graphify as any, 'spawnGraphify').mockImplementation(async (...params: any[]) => {
    const args = params[0] as string[];
    const output = resolve(args[args.indexOf('--out') + 1], 'graphify-out'); mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, 'graph.json'), JSON.stringify({ nodes: [{ id: 'a' }], links: [] }));
    writeFileSync(resolve(output, '.manifest-test'), 'cache');
  });
  const repo = (await store.getByKey(root, 'core'))!;
  return { root, source, sqlite, store, graphify, extraction, repo };
}

describe('Validated graph publication and recovery', () => {
  it('skips a second extraction and aggregate and preserves incremental sidecars on change', async () => {
    const f = await fixture();
    try {
      const first = await f.graphify.inspect(f.root, f.repo, { deferAggregate: true });
      const aggregates = new TechnologyGraphService(f.store);
      await aggregates.refresh(f.root, 'test');
      const second = await f.graphify.inspect(f.root, (await f.store.getByKey(f.root, 'core'))!, { deferAggregate: true });
      expect(second.unchanged).toBe(true); expect(f.extraction).toHaveBeenCalledTimes(1);
      expect((await aggregates.refresh(f.root, 'test'))?.unchanged).toBe(true);
      writeFileSync(resolve(f.source, 'code.ts'), 'export const value = 2;');
      const third = await f.graphify.inspect(f.root, (await f.store.getByKey(f.root, 'core'))!, { deferAggregate: true });
      expect(f.extraction).toHaveBeenCalledTimes(2);
      expect(third.graphPath).not.toBe(first.graphPath);
      expect(readFileSync(first.graphPath, 'utf8')).toContain('"a"');
      expect(readFileSync(resolve(third.graphPath, '..', '.manifest-test'), 'utf8')).toBe('cache');
    } finally { f.sqlite.close(); }
  });

  it('rebuilds when configuration changes or the published graph was corrupted', async () => {
    const f = await fixture();
    try {
      const first = await f.graphify.inspect(f.root, f.repo);
      await f.graphify.inspect(f.root, (await f.store.getByKey(f.root, 'core'))!, { noCluster: true });
      expect(f.extraction).toHaveBeenCalledTimes(2);
      const current = (await f.store.getByKey(f.root, 'core'))!;
      writeFileSync(current.graphJsonPath!, '{bad');
      await f.graphify.inspect(f.root, current, { noCluster: true });
      expect(f.extraction).toHaveBeenCalledTimes(3);
      expect(readFileSync(first.graphPath, 'utf8')).toContain('nodes');
    } finally { f.sqlite.close(); }
  });

  it('keeps the previous graph on extraction failure and never falsely heals it', async () => {
    const f = await fixture();
    try {
      const first = await f.graphify.inspect(f.root, f.repo);
      const graph = readFileSync(first.graphPath);
      const current = (await f.store.getByKey(f.root, 'core'))!;
      f.extraction.mockRejectedValueOnce(new Error('extractor failed'));
      await expect(f.graphify.inspect(f.root, current, { force: true })).rejects.toThrow('extractor failed');
      expect(readFileSync(first.graphPath)).toEqual(graph);
      expect((await f.store.getByKey(f.root, 'core'))?.graphJsonPath).toBe(first.graphPath);
      const report = await new InspectionReconcileService(f.store, f.graphify).reconcile(f.root);
      expect(report.healed).toHaveLength(0);
      expect((await f.store.getByKey(f.root, 'core'))?.inspectionStatus).toBe('FAILED');
    } finally { f.sqlite.close(); }
  });

  it('rejects changed sources before publication and restores a proven interrupted publication', async () => {
    const f = await fixture();
    try {
      const first = await f.graphify.inspect(f.root, f.repo);
      const current = (await f.store.getByKey(f.root, 'core'))!;
      const original = f.extraction.getMockImplementation()!;
      f.extraction.mockImplementationOnce(async (...args: any[]) => {
        await original(...args); writeFileSync(resolve(f.source, 'code.ts'), 'changed during extraction');
      });
      await expect(f.graphify.inspect(f.root, current, { force: true })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
      expect(f.graphify.resolveGraphPath(resolve(f.root, f.repo.graphOutput))).toBe(first.graphPath);
      // Only the exact published run (with matching digest and source fingerprint) is recoverable.
      const publication = f.graphify.readPublication(resolve(f.root, f.repo.graphOutput));
      await f.sqlite.run(f.root, "DELETE FROM inspections WHERE id<>?", [publication.inspectionId]);
      await f.sqlite.run(f.root, "UPDATE inspections SET status='RUNNING' WHERE id=?", [publication.inspectionId]);
      const report = await new InspectionReconcileService(f.store, f.graphify).reconcile(f.root);
      expect(report.healed).toHaveLength(1);
    } finally { f.sqlite.close(); }
  });

  it('rejects invalid JSON without replacing the last valid graph', async () => {
    const f = await fixture();
    try {
      const first = await f.graphify.inspect(f.root, f.repo);
      f.extraction.mockImplementationOnce(async (...params: any[]) => {
        const args = params[0] as string[]; const output = resolve(args[args.indexOf('--out') + 1], 'graphify-out');
        mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, 'graph.json'), '{}');
      });
      await expect(f.graphify.inspect(f.root, (await f.store.getByKey(f.root, 'core'))!, { force: true })).rejects.toThrow('nodes must be an array');
      expect(f.graphify.resolveGraphPath(resolve(f.root, f.repo.graphOutput))).toBe(first.graphPath);
    } finally { f.sqlite.close(); }
  });
});
