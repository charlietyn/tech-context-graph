import { normalizeTechnologyQuery } from '../src/models/technology-context-result';
import { selectTechnologyCore, TechnologyQueryService } from '../src/services/technology-query.service';
import { StoredRepository } from '../src/models/repository-state';

const core = {
  id: 'repo-1', key: 'nestjs-10', technology: 'nestjs', technologyVersion: '10.4.1',
  artifactKind: 'core', catalogStatus: 'ACCEPTED', enabled: true,
} as StoredRepository;

describe('TechnologyContextResult/1 producer', () => {
  it('rejects injection-looking IDs, unsupported versions, and missing path nodes', () => {
    expect(() => normalizeTechnologyQuery({ technology: 'nestjs; echo secret', versionConstraint: '10', action: 'query', question: 'hi' })).toThrow();
    expect(() => normalizeTechnologyQuery({ technology: 'nestjs', versionConstraint: 'latest', action: 'query', question: 'hi' })).toThrow();
    expect(() => normalizeTechnologyQuery({ technology: 'nestjs', versionConstraint: '10', action: 'path', question: 'A' })).toThrow();
  });

  it('selects one approved core matching a requested framework major only', () => {
    expect(selectTechnologyCore([core, { ...core, id: 'repo-2', technologyVersion: '11.0.0' }], 'nestjs', '10')).toBe(core);
    expect(() => selectTechnologyCore([core], 'nestjs', '11')).toThrow('No approved core');
    expect(() => selectTechnologyCore([core, { ...core, key: 'nestjs-other' }], 'nestjs', '10')).toThrow('Several approved');
  });

  function fixture() {
    const store = { list: jest.fn(async () => [core]) };
    const published = {
      graphPath: '/managed/.generations/one/graph.json', graphHash: 'a'.repeat(64),
      checkedAt: '2026-01-01T00:00:00.000Z', publishedAt: '2026-01-01T00:00:00.000Z',
      reference: { repositoryId: core.id, repositoryKey: core.key, sourceFingerprint: 'git-v2:1',
        graphDigestSha256: 'a'.repeat(64), graphifyVersion: 'v1', pointerInspectionId: 'inspection-1',
        publishedAt: '2026-01-01T00:00:00.000Z', repositoryCommit: null },
    };
    const resolver = { resolve: jest.fn(async () => published) };
    const graphify = { queryPublished: jest.fn(async () => ({ output: 'Graphify content', durationMs: 1, exitCode: 0 })) };
    const service = new TechnologyQueryService(store as never, resolver as never, graphify as never);
    const input = { technology: 'nestjs', versionConstraint: '10', action: 'query' as const, question: 'DTO validation' };
    return { store, resolver, graphify, service, published, input };
  }

  it('delivers graph-level provenance without inventing file-line references', async () => {
    const f = fixture();
    const output = await f.service.run('/ws', f.input);
    expect(output.status).toBe('READY');
    expect(output.graphHash).toBe('a'.repeat(64));
    expect(output.sourceRefs).toHaveLength(1);
    expect(output.sourceRefs[0].fileRef).toBeUndefined();
    expect(output.matches[0].confidence).toBe('INDEX');
    expect(f.graphify.queryPublished).toHaveBeenCalledTimes(1);
  });

  it('does not call Graphify if the pinned graph revision does not match', async () => {
    const f = fixture();
    const output = await f.service.run('/ws', { ...f.input, graphRevision: 'b'.repeat(64) });
    expect(output.status).toBe('STALE');
    expect(f.graphify.queryPublished).not.toHaveBeenCalled();
  });

  it('does not return output when source changes during a query', async () => {
    const f = fixture();
    f.resolver.resolve.mockResolvedValueOnce(f.published).mockResolvedValueOnce({
      ...f.published, reference: { ...f.published.reference, sourceFingerprint: 'git-v2:2' },
    });
    const output = await f.service.run('/ws', f.input);
    expect(output.status).toBe('STALE');
    expect(output.matches).toEqual([]);
  });
});
