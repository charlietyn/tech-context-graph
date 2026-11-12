import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { StoredRepository } from '../src/models/repository-state';
import { assertGraphOutputContained } from '../src/services/graph-output-path';
import { GraphifyCliService } from '../src/services/graphify-cli.service';
import { PublishedGraphResolverService } from '../src/services/published-graph-resolver.service';
import { RepositoryFingerprintService } from '../src/services/repository-fingerprint.service';
import { TechnologyQueryService } from '../src/services/technology-query.service';

/**
 * TCG-15: symbolic links and Windows junctions that leave the workspace, at every level a
 * published graph is read from, must fail closed with a typed error and no path in the output.
 * Directory links use junctions on Windows (no privilege needed); file links need a privilege
 * there, so those cases run only where the platform allows creating them.
 */
const linkDir = (target: string, path: string) => symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
const fileLinksAllowed = (() => {
  const probe = mkdtempSync(resolve(tmpdir(), 'tcg-link-probe-'));
  try { writeFileSync(resolve(probe, 'a'), ''); symlinkSync(resolve(probe, 'a'), resolve(probe, 'b'), 'file'); return true; }
  catch { return false; } finally { rmSync(probe, { recursive: true, force: true }); }
})();
const itFileLink = fileLinksAllowed ? it : it.skip;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: {
  ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
} }).trim();

function gitRepo(path: string, content: string) {
  mkdirSync(path, { recursive: true });
  writeFileSync(resolve(path, 'code.ts'), content);
  git(path, 'init', '-q'); git(path, 'add', '.'); git(path, 'commit', '-q', '-m', 'init');
}

async function fixture(options: { sourceViaLink?: boolean } = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'tcg containment '));
  const workspace = resolve(root, 'workspace');
  const outside = resolve(root, 'outside');
  mkdirSync(outside, { recursive: true });
  const realSource = resolve(root, 'source-a');
  gitRepo(realSource, 'export const a = 1;');
  let sourcePath = realSource;
  if (options.sourceViaLink) { sourcePath = resolve(root, 'source-link'); linkDir(realSource, sourcePath); }
  const graphOutput = './tech-graphify-out/technologies/nestjs/core';
  const output = resolve(workspace, graphOutput);
  const graphPath = resolve(output, '.generations', 'g1', 'graph.json');
  mkdirSync(dirname(graphPath), { recursive: true });
  writeFileSync(graphPath, JSON.stringify({ nodes: [{ id: 'A' }], links: [] }));
  const fingerprints = new RepositoryFingerprintService();
  const fingerprint = await fingerprints.calculate({ sourcePath });
  writeFileSync(resolve(output, 'tcg-current.json'), JSON.stringify({
    schema: 2, graph: '.generations/g1/graph.json', graphDigest: createHash('sha256').update(readFileSync(graphPath)).digest('hex'),
    inspectionId: 'g1', fingerprint, graphifyVersion: 'v1', publishedAt: new Date().toISOString(),
  }));
  const repository = {
    id: 'r1', key: 'core', enabled: true, catalogStatus: 'ACCEPTED', technology: 'nestjs', artifactKind: 'core',
    technologyVersion: '11.0.0', path: sourcePath, sourcePath, graphOutput, inspectionStatus: 'READY',
    lastInspectionId: 'g1', sourceFingerprint: fingerprint, graphJsonPath: graphPath,
  } as StoredRepository;
  const graphify = {
    graphCounts: jest.fn(() => ({ nodes: 1, edges: 0, danglingEdges: 0 })),
    version: jest.fn(async () => 'v1'),
    queryPublished: jest.fn(async () => ({ output: 'answer', durationMs: 1, exitCode: 0 })),
  };
  const service = new TechnologyQueryService({ listSnapshot: async () => [repository] } as never,
    new PublishedGraphResolverService(fingerprints, graphify as never), graphify as never);
  const query = (ws = workspace) => service.run(ws, { technology: 'nestjs', versionConstraint: '11', action: 'query', question: 'A' });
  return { root, workspace, outside, output, graphPath, realSource, sourcePath, repository, graphify, query };
}

/** Move `path` outside the workspace and leave a link to it in its place. */
function escape(f: Awaited<ReturnType<typeof fixture>>, path: string, kind: 'dir' | 'file') {
  const target = resolve(f.outside, kind + '-' + readdirSync(f.outside).length);
  if (kind === 'dir') { cpSync(path, target, { recursive: true }); rmSync(path, { recursive: true, force: true }); linkDir(target, path); }
  else { renameSync(path, target); symlinkSync(target, path, 'file'); }
  return target;
}

function expectTypedFailureWithoutPaths(result: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['query']>>, root: string) {
  expect(result).toMatchObject({ status: 'FAILED', sourceRefs: [], matches: [], error: { code: 'INTEGRITY_FAILED', retryable: false } });
  const text = JSON.stringify(result);
  for (const fragment of [root, root.replace(/\\/g, '\\\\'), tmpdir()]) expect(text).not.toContain(fragment);
}

describe('TCG-15 containment of published graphs behind links', () => {
  const roots: string[] = [];
  afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });
  const make = async (options?: { sourceViaLink?: boolean }) => { const f = await fixture(options); roots.push(f.root); return f; };

  it('serves READY for an intact publication, also when the workspace itself is reached through a link', async () => {
    const f = await make();
    expect((await f.query()).status).toBe('READY');
    const viaLink = resolve(f.root, 'workspace-link');
    linkDir(f.workspace, viaLink);
    expect((await f.query(viaLink)).status).toBe('READY');
  });

  it.each([
    ['the repository graph output', (f: Awaited<ReturnType<typeof fixture>>) => f.output],
    ['the technology folder', (f: Awaited<ReturnType<typeof fixture>>) => dirname(f.output)],
    ['tech-graphify-out', (f: Awaited<ReturnType<typeof fixture>>) => resolve(f.workspace, 'tech-graphify-out')],
    ['.generations', (f: Awaited<ReturnType<typeof fixture>>) => resolve(f.output, '.generations')],
    ['one generation', (f: Awaited<ReturnType<typeof fixture>>) => dirname(f.graphPath)],
  ])('fails closed when %s is a directory link outside the workspace', async (_name, pick) => {
    const f = await make();
    escape(f, pick(f), 'dir');
    expectTypedFailureWithoutPaths(await f.query(), f.root);
    expect(f.graphify.queryPublished).not.toHaveBeenCalled();
  });

  itFileLink('fails closed when graph.json is a file link outside the workspace', async () => {
    const f = await make();
    escape(f, f.graphPath, 'file');
    expectTypedFailureWithoutPaths(await f.query(), f.root);
  });

  itFileLink('fails closed (not MISSING) when the publication pointer is a file link outside its output', async () => {
    const f = await make();
    escape(f, resolve(f.output, 'tcg-current.json'), 'file');
    expectTypedFailureWithoutPaths(await f.query(), f.root);
  });

  it('never writes an inspection through an output link that leaves the workspace', async () => {
    const f = await make();
    const target = escape(f, f.output, 'dir');
    const before = readdirSync(target).sort();
    expect(() => assertGraphOutputContained(f.workspace, f.output)).toThrow(/outside the workspace/);
    const graphify = new GraphifyCliService({} as never, {} as never);
    const failure = await graphify.inspect(f.workspace, f.repository).then(() => undefined, (error: unknown) => error as Error & { code?: string });
    expect(failure?.code).toBe('PATH_ESCAPE');
    expect(failure?.message).not.toContain(f.root);
    expect(readdirSync(target).sort()).toEqual(before);
    expect(existsSync(resolve(target, '.tcg-inspection.lock'))).toBe(false);
    // A not-yet-created output below an escaping ancestor is refused too.
    expect(() => assertGraphOutputContained(f.workspace, resolve(f.output, 'not', 'created'))).toThrow(/outside the workspace/);
    // Intact outputs and intentionally absolute outputs elsewhere are unaffected.
    expect(() => assertGraphOutputContained(f.workspace, resolve(f.workspace, 'tech-graphify-out', 'other'))).not.toThrow();
    expect(() => assertGraphOutputContained(f.workspace, resolve(f.outside, 'configured-absolute'))).not.toThrow();
  });

  it('a source link retargeted to another repository is STALE, never READY for the old graph', async () => {
    const f = await make({ sourceViaLink: true });
    expect((await f.query()).status).toBe('READY');
    const other = resolve(f.root, 'source-b');
    gitRepo(other, 'export const b = 2;');
    if (process.platform === 'win32') rmSync(f.sourcePath, { recursive: true, force: true }); else unlinkSync(f.sourcePath);
    linkDir(other, f.sourcePath);
    const result = await f.query();
    expect(result).toMatchObject({ status: 'STALE', matches: [], error: { code: 'STALE_GRAPH' } });
    expect(JSON.stringify(result)).not.toContain(f.root);
  });
});
