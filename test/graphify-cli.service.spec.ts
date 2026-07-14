import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GraphifyCliService, describeExitFailure, graphSummaryFromLine, graphifyProgressFromLine } from '../src/services/graphify-cli.service';
import { canonicalGraphOutput, technologyMemberGraphOutput } from '../src/services/graph-output-path';

describe('GraphifyCliService output contract', () => {
  const service = new GraphifyCliService({} as never, {} as never);

  it('resolves the nested graphify-out path produced by graphify extract --out', () => {
    const output = mkdtempSync(join(tmpdir(), 'tcg-graphify-output-'));
    mkdirSync(join(output, 'graphify-out'), { recursive: true });
    writeFileSync(join(output, 'graphify-out', 'graph.json'), '{"nodes":[],"links":[]}');

    expect(service.resolveGraphPath(output)).toBe(resolve(output, 'graphify-out', 'graph.json'));
  });

  it('keeps compatibility with legacy direct graph.json outputs', () => {
    const output = mkdtempSync(join(tmpdir(), 'tcg-graphify-legacy-'));
    writeFileSync(join(output, 'graph.json'), '{"nodes":[],"links":[]}');

    expect(service.resolveGraphPath(output)).toBe(resolve(output, 'graph.json'));
  });

  it('detects edges whose endpoints are missing before registering READY', () => {
    const output = mkdtempSync(join(tmpdir(), 'tcg-graphify-integrity-'));
    const graphPath = join(output, 'graph.json');
    writeFileSync(graphPath, JSON.stringify({
      nodes: [{ id: 'A' }],
      links: [{ source: 'A', target: 'B' }],
    }));

    expect(service.graphCounts(graphPath)).toEqual({ nodes: 1, edges: 1, danglingEdges: 1 });
    expect(service.removeDanglingEdges(graphPath)).toBe(1);
    expect(service.graphCounts(graphPath)).toEqual({ nodes: 1, edges: 0, danglingEdges: 0 });
  });
});

describe('Graphify inspection progress and managed output paths', () => {
  it('migrates legacy managed outputs away from the project graph folder', () => {
    expect(canonicalGraphOutput('./graphify-out/technologies/laravel-2'))
      .toBe('./tech-graphify-out/technologies/laravel-2');
    expect(canonicalGraphOutput('./tech-graphify-out/technologies/nest'))
      .toBe('./tech-graphify-out/technologies/nest');
  });

  it('nests member repositories below their aggregate technology', () => {
    expect(technologyMemberGraphOutput('vue', 'router'))
      .toBe('./tech-graphify-out/technologies/vue/router');
  });

  it('turns Graphify AST counters into structured progress', () => {
    expect(graphifyProgressFromLine('AST extraction: 100/1967 uncached files (5%) [8 workers]')).toEqual({
      stage: 'extracting',
      percent: 10,
      message: 'AST 100/1967 files (5%)',
    });
  });

  it('extracts node, edge and community totals from the terminal write line', () => {
    const line = '[graphify extract] wrote C:\\ws\\tech-graphify-out\\technologies\\primevue\\graphify-out\\graph.json: 13,357 nodes, 15,553 edges, 1,943 communities';
    expect(graphSummaryFromLine(line)).toEqual({ nodes: 13357, edges: 15553, communities: 1943 });
    expect(graphSummaryFromLine('AST extraction: 100/1967 uncached files (5%)')).toBeUndefined();
  });

  it('translates opaque Windows exit codes into a human diagnosis', () => {
    // 4294967295 === 0xFFFFFFFF === -1 as a signed DWORD, the crash seen in the .tcg logs.
    expect(describeExitFailure(4294967295, '')).toContain('code -1 (0xFFFFFFFF)');
    expect(describeExitFailure(4294967295, '')).toContain('generic internal failure');
    // 0xC0000005 is an access violation / segfault.
    expect(describeExitFailure(3221225477, 'boom')).toContain('access violation');
    expect(describeExitFailure(3221225477, 'boom')).toContain('boom');
    expect(describeExitFailure(null, '')).toContain('terminated by a signal');
    expect(describeExitFailure(2, 'bad args')).toBe('Graphify crashed with code 2. bad args');
  });
});
