import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { PublishedGraphResolverService } from '../src/services/published-graph-resolver.service';
import { StoredRepository } from '../src/models/repository-state';

describe('PublishedGraphResolverService fail-closed publication', () => {
  function fixture() {
    const workspace = mkdtempSync(resolve(tmpdir(), 'tcg-published-read-'));
    const sourcePath = resolve(workspace, 'src-repo');
    mkdirSync(sourcePath);
    const output = resolve(workspace, 'tech-graphify-out/technologies/nestjs/core');
    const generation = resolve(output, '.generations/inspection1');
    mkdirSync(generation, { recursive: true });
    const graphPath = resolve(generation, 'graph.json');
    writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'A' }], links: [] }));
    const graphDigest = createHash('sha256').update(readFileSync(graphPath)).digest('hex');
    const repository = {
      id: 'r1', key: 'core', enabled: true, catalogStatus: 'ACCEPTED',
      sourcePath, graphOutput: './tech-graphify-out/technologies/nestjs/core',
      inspectionStatus: 'READY', gitRepository: false, sourceFingerprint: 'files-v2:1',
    } as StoredRepository;
    const pointer = { schema: 2, graph: '.generations/inspection1/graph.json', graphDigest,
      inspectionId: 'inspection1', fingerprint: 'files-v2:1', graphifyVersion: '1.0.0',
      publishedAt: new Date().toISOString() };
    writeFileSync(resolve(output, 'tcg-current.json'), JSON.stringify(pointer));
    const fingerprints = { calculate: jest.fn(async () => 'files-v2:1') };
    const graphify = { graphCounts: jest.fn(() => ({ nodes: 1, edges: 0, danglingEdges: 0 })) };
    const resolver = new PublishedGraphResolverService(fingerprints as never, graphify as never);
    return { workspace, graphPath, output, repository, pointer, fingerprints, resolver };
  }

  it('verifies digest, version and freshness before trusting a generation', async () => {
    const f = fixture();
    expect((await f.resolver.resolve(f.workspace, f.repository)).reference.graphDigestSha256).toBe(f.pointer.graphDigest);
  });

  it('refuses an edited graph, even if the SQLite status is READY', async () => {
    const f = fixture();
    writeFileSync(f.graphPath, JSON.stringify({ nodes: [{ id: 'B' }], links: [] }));
    await expect(f.resolver.resolve(f.workspace, f.repository)).rejects.toMatchObject({ code: 'INTEGRITY_FAILED' });
  });

  it('refuses stale source fingerprints', async () => {
    const f = fixture();
    f.fingerprints.calculate.mockResolvedValue('files-v2:other');
    await expect(f.resolver.resolve(f.workspace, f.repository)).rejects.toMatchObject({ code: 'STALE_GRAPH', status: 'STALE' });
  });

  it('refuses path traversal through a publication pointer', async () => {
    const f = fixture();
    writeFileSync(resolve(f.output, 'tcg-current.json'), JSON.stringify({ ...f.pointer, graph: '../../secret.json' }));
    await expect(f.resolver.resolve(f.workspace, f.repository)).rejects.toMatchObject({ code: 'INTEGRITY_FAILED' });
  });
});
