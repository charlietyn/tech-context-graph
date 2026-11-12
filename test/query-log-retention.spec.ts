import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { RepositoryStoreService } from '../src/persistence/repository-store.service';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';

describe('Bounded opt-in TUI query history', () => {
  it('caps query size and retention rows without touching other repositories', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-query-audit-'));
    const paths = ['one', 'two'].map((name) => resolve(root, name));
    for (const path of paths) mkdirSync(path);
    const sqlite = new SqliteDatabaseService();
    const store = new RepositoryStoreService(sqlite);
    try {
      for (let i = 0; i < paths.length; i++) {
        await store.upsertManual(root, {
          key: String(i), path: paths[i], role: 'library', category: 'library', technology: 'testing',
        });
      }
      const a = (await store.getByKey(root, '0'))!;
      const b = (await store.getByKey(root, '1'))!;
      await store.recordQuery(root, {
        repositoryId: b.id, action: 'query', input: 'other',
        status: 'SUCCESS', durationMs: 1, maxRows: 2,
      });
      for (let i = 0; i < 6; i++) {
        await store.recordQuery(root, {
          repositoryId: a.id, action: 'query', input: 'Q'.repeat(3000),
          output: 'A'.repeat(50000), status: 'SUCCESS', durationMs: i, maxRows: 2,
        });
      }
      const rows = await sqlite.all<{ input_text: string; output_text: string }>(
        root, 'SELECT input_text,output_text FROM graph_queries WHERE repository_id=?', [a.id],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].input_text).toHaveLength(2048);
      expect(rows[0].output_text).toHaveLength(32768);
      expect((await sqlite.all(root, 'SELECT id FROM graph_queries WHERE repository_id=?', [b.id]))).toHaveLength(1);
    } finally { sqlite.close(); }
  });
});
