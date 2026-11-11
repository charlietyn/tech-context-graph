'use strict';

/**
 * Real integration, not a Graphify mock: the compiled TCG CLI drives the actual Graphify CLI on PATH
 * (code-only, GRAPHIFY_BACKEND=none) against small Git sources created inside OS tmpdir. No model calls,
 * no remote clones and no writes to any user workspace (TCG_CONFIG_HOME is a temporary directory too).
 *
 * Covers: two cores of one technology (nestjs 10 and 11) never mixed; query/explain/path READY with
 * provenance; plan 28 C1 (READY needs a clean Git commit: dirty-published => STALE, non-Git => FAILED);
 * wrong major => MISSING; pinned revision mismatch => STALE; source commit after READY => STALE;
 * Graphify absent => FAILED; CONTRACT-003 reference. Every JSON output is validated with Ajv against
 * the published schemas, and the real outputs are exported as producer fixtures in ci-evidence/.
 */
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const Ajv = require('ajv');

const repo = resolve(__dirname, '..');
const cli = resolve(repo, 'dist', 'main.js');
const evidenceDir = resolve(repo, 'ci-evidence');
const fixturesDir = resolve(evidenceDir, 'contract-fixtures');
const schema = (name) => new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(resolve(repo, 'docs/contracts', name), 'utf8')));
const verifyResult = schema('technology-context-result.v1.schema.json');
const verifyReference = schema('technology-graph-reference.v1.schema.json');

const root = mkdtempSync(resolve(tmpdir(), 'tcg-graphify-real-'));
const workspace = resolve(root, 'workspace');
const env = {
  ...process.env, TCG_CONFIG_HOME: resolve(root, 'config'), GRAPHIFY_BACKEND: 'none', GRAPHIFY_QUERY_LOG_DISABLE: '1',
  // Deterministic commits make repositoryCommit reproducible across runs and machines.
  GIT_AUTHOR_NAME: 'tcg-smoke', GIT_AUTHOR_EMAIL: 'tcg-smoke@example.invalid', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'tcg-smoke', GIT_COMMITTER_EMAIL: 'tcg-smoke@example.invalid', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

function tcg(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...env, ...extraEnv }, timeout: 600_000 });
  assert.ifError(result.error);
  return { exitCode: result.status, stdout: result.stdout.trim(), stderr: result.stderr };
}
function contract(args, extraEnv) {
  const result = tcg(args, extraEnv);
  const body = JSON.parse(result.stdout);
  // One JSON object on stdout, nothing else (no banner, no TUI).
  assert.equal(result.stdout, JSON.stringify(body), 'stdout must be exactly one JSON object');
  return { ...result, body };
}
const query = (technology, version, action, question, extra = [], extraEnv) => {
  const out = contract(['technology:query', '--workspace', workspace, '--technology', technology, '--version', version,
    '--action', action, '--question', question, ...extra, '--json'], extraEnv);
  assert.ok(verifyResult(out.body), 'CONTRACT-002 schema: ' + JSON.stringify(verifyResult.errors));
  return out;
};
const reference = (technology, version, extra = []) => {
  const out = contract(['technology:reference', '--workspace', workspace, '--technology', technology, '--version', version, ...extra, '--json']);
  assert.ok(verifyReference(out.body), 'CONTRACT-003 schema: ' + JSON.stringify(verifyReference.errors));
  return out;
};
const expectStatus = (out, status, exitCode, code) => {
  assert.equal(out.body.status, status, JSON.stringify(out.body.error));
  assert.equal(out.exitCode, exitCode);
  if (code) assert.equal(out.body.error.code, code);
};

function gitSource(name, files, { commit = true } = {}) {
  const path = resolve(root, 'sources', name);
  mkdirSync(path, { recursive: true });
  for (const [file, content] of Object.entries(files)) writeFileSync(resolve(path, file), content);
  if (commit) {
    execFileSync('git', ['init', '-q'], { cwd: path, env });
    execFileSync('git', ['add', '.'], { cwd: path, env });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: path, env });
  }
  return path;
}
const welcome = (major) => [
  'export class WelcomeService {',
  `  hello(name: string): string { return "Hello ${major}, " + name; }`,
  '}',
  'export class Caller {',
  '  useWelcome(): string { return new WelcomeService().hello("Graphify"); }',
  '}',
].join('\n');

function register(key, path, technology, version) {
  const add = tcg(['project:add', key, path, '--workspace', workspace, '--type', 'technology', '--category', 'backend',
    '--technology', technology, '--kind', 'core', '--technology-version', version, '--ignore-profile', 'common', '--json']);
  assert.equal(add.exitCode, 0, add.stderr);
  assert.equal(JSON.parse(add.stdout).technologyVersion, version, 'project:add must report the effective version');
  const inspect = tcg(['repository:inspect', key, '--workspace', workspace, '--no-cluster']);
  assert.equal(inspect.exitCode, 0, inspect.stderr + inspect.stdout);
}

async function main() {
  mkdirSync(fixturesDir, { recursive: true });
  const evidence = { schemaVersion: '2.0', outcome: 'FAIL', graphify: null, tcgCommit: null, checks: {} };
  const exported = {};
  try {
    evidence.graphify = execFileSync('graphify', ['--version'], { encoding: 'utf8' }).trim();
    evidence.tcgCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    assert.equal(tcg(['workspace:create', '--path', workspace, '--name', 'smoke', '--non-interactive']).exitCode, 0);

    const core10 = gitSource('nest-10', { 'hello.ts': welcome(10) });
    const core11 = gitSource('nest-11', { 'hello.ts': welcome(11), 'extra.ts': 'export class OnlyInEleven {}\n' });
    const dirty = gitSource('nuxt-4', { 'hello.ts': welcome(4) });
    writeFileSync(resolve(dirty, 'uncommitted.ts'), 'export const draft = true;\n');
    const plain = gitSource('vite-8', { 'hello.ts': welcome(8) }, { commit: false });
    register('nestjs-core-10', core10, 'nestjs', '10.4.0');
    register('nestjs-core-11', core11, 'nestjs', '11.1.0');
    register('nuxt-core-4', dirty, 'nuxt', '4.0.0');
    register('vite-core-8', plain, 'vite', '8.0.0');
    const head = (path) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path, encoding: 'utf8' }).trim();

    // TCG-06: exact majors, no mixing.
    const ready10 = query('nestjs', '10', 'query', 'WelcomeService');
    const ready11 = query('nestjs', '11', 'query', 'WelcomeService');
    expectStatus(ready10, 'READY', 0); expectStatus(ready11, 'READY', 0);
    assert.equal(ready10.body.resolvedVersion, '10.4.0'); assert.equal(ready11.body.resolvedVersion, '11.1.0');
    assert.notEqual(ready10.body.graphHash, ready11.body.graphHash);
    assert.equal(ready10.body.sourceRefs[0].repositoryCommit, head(core10));
    assert.equal(ready11.body.sourceRefs[0].repositoryCommit, head(core11));
    assert.equal(ready11.body.sourceRefs[0].graphDigestSha256, ready11.body.graphHash);
    assert.ok(ready11.body.matches.every((match) => match.confidence === 'INDEX'), 'unstructured output is never SOURCE');
    assert.ok(ready11.body.sourceRefs.every((ref) => ref.fileRef === undefined), 'no invented file/line citations');
    exported.ready = ready11.body;
    evidence.checks.dualMajor = { v10: ready10.body.graphHash, v11: ready11.body.graphHash, commit11: head(core11) };

    // TCG-04: the three verbs against the real graph.
    const explain = query('nestjs', '11', 'explain', 'WelcomeService');
    expectStatus(explain, 'READY', 0);
    const path = query('nestjs', '11', 'path', 'Caller', ['--to', 'WelcomeService']);
    expectStatus(path, 'READY', 0);
    evidence.checks.verbs = { explainBytes: explain.body.matches[0]?.content.length ?? 0, pathBytes: path.body.matches[0]?.content.length ?? 0 };

    // CONTRACT-003 reference: same publication as the query, no Graphify run.
    const ref11 = reference('nestjs', '11');
    expectStatus(ref11, 'READY', 0);
    assert.equal(ref11.body.graphSha256, 'sha256:' + ready11.body.graphHash);
    assert.equal(ref11.body.repositoryCommit, head(core11));
    exported.reference = ref11.body;

    // Negative paths, each with its documented status and exit code.
    const missing = query('nestjs', '12', 'query', 'WelcomeService');
    expectStatus(missing, 'MISSING', 4, 'VERSION_MISMATCH'); exported['version-mismatch'] = missing.body;
    const pinned = query('nestjs', '11', 'query', 'WelcomeService', ['--revision', 'f'.repeat(64)]);
    expectStatus(pinned, 'STALE', 3, 'STALE_GRAPH');
    const dirtyPublished = query('nuxt', '4', 'query', 'WelcomeService');
    expectStatus(dirtyPublished, 'STALE', 3, 'SOURCE_CHANGED'); exported['stale-uncommitted'] = dirtyPublished.body;
    const nonGit = query('vite', '8', 'query', 'WelcomeService');
    expectStatus(nonGit, 'FAILED', 2, 'INTEGRITY_FAILED'); exported['failed-no-commit'] = nonGit.body;
    expectStatus(reference('vite', '8'), 'FAILED', 2, 'INTEGRITY_FAILED');
    // PATH with Git but without Graphify (removing Git too would fail the fingerprint first: STALE).
    const gitOnly = resolve(root, 'git-only-bin');
    mkdirSync(gitOnly);
    symlinkSync(execFileSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim(),
      resolve(gitOnly, process.platform === 'win32' ? 'git.exe' : 'git'));
    const noGraphify = query('nestjs', '11', 'query', 'WelcomeService', [], { PATH: gitOnly });
    expectStatus(noGraphify, 'FAILED', 2, 'GRAPHIFY_UNAVAILABLE'); exported['failed-graphify-unavailable'] = noGraphify.body;
    const invalid = query('nestjs', '^11', 'query', 'WelcomeService');
    expectStatus(invalid, 'FAILED', 2, 'INVALID_INPUT');

    // TCG-03/08: a new commit after READY makes the old publication STALE, and nothing leaks.
    writeFileSync(resolve(core11, 'hello.ts'), 'export const changedSource = true;\n');
    execFileSync('git', ['commit', '-q', '-am', 'change'], { cwd: core11, env });
    const stale = query('nestjs', '11', 'query', 'WelcomeService');
    expectStatus(stale, 'STALE', 3, 'STALE_GRAPH');
    assert.equal(stale.body.matches.length, 0); assert.equal(stale.body.sourceRefs.length, 0);
    exported.stale = stale.body;
    expectStatus(query('nestjs', '10', 'query', 'WelcomeService'), 'READY', 0); // the other major is untouched

    evidence.outcome = 'PASS';
    console.log(JSON.stringify({ outcome: 'PASS', graphify: evidence.graphify, v11: ready11.body.graphHash, commit11: head(core11) }));
  } finally {
    for (const [name, body] of Object.entries(exported)) {
      writeFileSync(resolve(fixturesDir, name + '.json'), JSON.stringify(body, null, 2) + '\n');
    }
    writeFileSync(resolve(evidenceDir, 'graphify-smoke.json'), JSON.stringify(evidence, null, 2) + '\n');
    rmSync(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error('Real Graphify integration failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
