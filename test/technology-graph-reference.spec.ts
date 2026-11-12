import Ajv from 'ajv';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { TechnologyContextResultV1 } from '../src/models/technology-context-result';
import { bareGraphDigest, technologyGraphReferenceFromResult } from '../src/models/technology-graph-reference';
import { RepositoryFingerprintService } from '../src/services/repository-fingerprint.service';

const root = resolve(__dirname, '..');
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const verifyReference = new Ajv({ allErrors: true }).compile(read('docs/contracts/technology-graph-reference.v1.schema.json'));
const verifyResult = new Ajv({ allErrors: true }).compile(read('docs/contracts/technology-context-result.v1.schema.json'));
const fixture = (status: string) => read('test/fixtures/contracts/technology-graph-reference/v1/' + status + '.json');

describe('CONTRACT-003 TechnologyGraphReferenceV1', () => {
  it.each(['ready', 'stale', 'missing', 'failed'])('accepts the %s fixture', (status) => {
    expect(verifyReference(fixture(status))).toBe(true);
  });

  it('rejects partial, forged or future references', () => {
    const mutate = (change: (value: Record<string, unknown>) => void, base = 'ready') => {
      const value = fixture(base); change(value); return verifyReference(value);
    };
    expect(mutate((v) => { delete v.repositoryCommit; })).toBe(false);
    expect(mutate((v) => { delete v.freshnessCheckedAt; })).toBe(false);
    expect(mutate((v) => { v.graphSha256 = 'a'.repeat(64); })).toBe(false); // bare hex is CONTRACT-002 only
    expect(mutate((v) => { v.graphArtifact = 'aggregate'; })).toBe(false);
    expect(mutate((v) => { v.sourceFingerprint = 'files-v2:' + 'c'.repeat(64); })).toBe(false);
    expect(mutate((v) => { v.schemaVersion = '2.0'; })).toBe(false);
    expect(mutate((v) => { v.authorizesExecution = true; })).toBe(false);
    expect(mutate((v) => { v.error = { code: 'QUERY_FAILED', retryable: false, message: 'x' }; })).toBe(false);
    // A non-READY reference can never carry a sealable digest or commit.
    expect(mutate((v) => { v.graphSha256 = 'sha256:' + 'a'.repeat(64); }, 'stale')).toBe(false);
    expect(mutate((v) => { v.repositoryCommit = 'b'.repeat(40); }, 'missing')).toBe(false);
    expect(mutate((v) => { delete v.error; }, 'failed')).toBe(false);
  });

  it('projects a CONTRACT-002 READY result without renaming or inventing provenance', () => {
    const result = read('test/fixtures/contracts/technology-context/v1/ready.json') as TechnologyContextResultV1;
    result.sourceRefs[0].sourceFingerprint = 'git-v2:' + 'c'.repeat(64);
    expect(verifyResult(result)).toBe(true);
    const reference = technologyGraphReferenceFromResult(result);
    expect(verifyReference(reference)).toBe(true);
    expect(reference).toMatchObject({
      status: 'READY', graphSha256: 'sha256:' + result.graphHash, resolvedVersion: result.resolvedVersion,
      repositoryCommit: result.sourceRefs[0].repositoryCommit, publishedAt: result.sourceRefs[0].publishedAt,
      inspectionId: result.sourceRefs[0].pointerInspectionId, freshnessCheckedAt: result.freshnessCheckedAt,
    });
    expect(bareGraphDigest(reference.graphSha256!)).toBe(result.graphHash);
    expect(bareGraphDigest('sha256:XYZ')).toBeNull();
  });

  it('downgrades an inconsistent READY result instead of sealing it', () => {
    const base = read('test/fixtures/contracts/technology-context/v1/ready.json') as TechnologyContextResultV1;
    for (const broken of [
      { ...base, sourceRefs: [{ ...base.sourceRefs[0], repositoryCommit: null }] },
      { ...base, sourceRefs: [{ ...base.sourceRefs[0], graphDigestSha256: 'f'.repeat(64) }] },
      { ...base, sourceRefs: [base.sourceRefs[0], base.sourceRefs[0]] },
      { ...base, freshnessCheckedAt: undefined },
    ]) {
      const reference = technologyGraphReferenceFromResult(broken);
      expect(reference).toMatchObject({ status: 'FAILED', error: { code: 'INTEGRITY_FAILED' } });
      expect(reference.graphSha256).toBeUndefined();
      expect(verifyReference(reference)).toBe(true);
    }
    const stale = technologyGraphReferenceFromResult(read('test/fixtures/contracts/technology-context/v1/stale.json'));
    expect(stale).toMatchObject({ status: 'STALE', error: { code: 'STALE_GRAPH' } });
    expect(verifyReference(stale)).toBe(true);
  });
});

describe('RepositoryFingerprintService.describe (real Git)', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

  it('reports the commit and a source-path scoped clean flag from the fingerprint reads', async () => {
    const repo = mkdtempSync(resolve(tmpdir(), 'tcg-describe-'));
    try {
      git(repo, 'init', '-q');
      git(repo, 'config', 'user.email', 'tcg@example.invalid');
      git(repo, 'config', 'user.name', 'tcg');
      mkdirSync(resolve(repo, 'core')); mkdirSync(resolve(repo, 'other'));
      writeFileSync(resolve(repo, 'core', 'a.ts'), 'export const a = 1;');
      writeFileSync(resolve(repo, 'other', 'b.ts'), 'export const b = 1;');
      git(repo, 'add', '.'); git(repo, 'commit', '-q', '-m', 'init');
      const head = git(repo, 'rev-parse', 'HEAD');
      const service = new RepositoryFingerprintService();
      const clean = await service.describe({ sourcePath: resolve(repo, 'core') });
      expect(clean).toMatchObject({ gitHead: head, clean: true });
      expect(clean.value).toMatch(/^git-v2:[a-f0-9]{64}$/);
      // Dirt outside the source subtree does not affect a monorepo member.
      writeFileSync(resolve(repo, 'other', 'b.ts'), 'export const b = 2;');
      expect(await service.describe({ sourcePath: resolve(repo, 'core') })).toMatchObject({ clean: true, value: clean.value });
      writeFileSync(resolve(repo, 'core', 'untracked.ts'), 'export const u = 1;');
      const dirty = await service.describe({ sourcePath: resolve(repo, 'core') });
      expect(dirty).toMatchObject({ gitHead: head, clean: false });
      expect(dirty.value).not.toBe(clean.value);
      expect(await service.calculate({ sourcePath: resolve(repo, 'core') })).toBe(dirty.value);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });

  it('has no commit for plain folders', async () => {
    const folder = mkdtempSync(resolve(tmpdir(), 'tcg-describe-plain-'));
    try {
      writeFileSync(resolve(folder, 'a.ts'), 'export const a = 1;');
      expect(await new RepositoryFingerprintService().describe({ sourcePath: folder }))
        .toMatchObject({ gitHead: null, clean: null, value: expect.stringMatching(/^files-v2:/) });
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
});

describe('Producer fixtures exported from the real CLI + Graphify smoke', () => {
  const dir = 'test/fixtures/contracts/technology-context/v1/real/';
  it.each([
    ['ready', 'READY', undefined], ['stale', 'STALE', 'STALE_GRAPH'], ['version-mismatch', 'MISSING', 'VERSION_MISMATCH'],
    ['stale-uncommitted', 'STALE', 'SOURCE_CHANGED'], ['failed-no-commit', 'FAILED', 'INTEGRITY_FAILED'],
    ['failed-graphify-unavailable', 'FAILED', 'GRAPHIFY_UNAVAILABLE'],
  ])('%s validates against CONTRACT-002 with its documented status', (name, status, code) => {
    const payload = read(dir + name + '.json');
    expect(verifyResult(payload)).toBe(true);
    expect(payload.status).toBe(status);
    expect(payload.error?.code).toBe(code);
    expect(JSON.stringify(payload)).not.toMatch(/\/tmp\/|\/home\/|[A-Z]:\\\\/);
  });

  it('the real reference equals the projection of the real READY result', () => {
    const real = read('test/fixtures/contracts/technology-graph-reference/v1/real-ready.json');
    expect(verifyReference(real)).toBe(true);
    const projected = technologyGraphReferenceFromResult(read(dir + 'ready.json'));
    expect({ ...real, freshnessCheckedAt: undefined }).toEqual({ ...projected, freshnessCheckedAt: undefined });
  });
});
