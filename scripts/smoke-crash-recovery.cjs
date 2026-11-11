'use strict';

/**
 * TCG-14 · real crash recovery. The compiled CLI runs a real Graphify inspection and is killed with
 * SIGKILL (scripts/test-hooks/crash-at.cjs) at each step of publishing `tcg-current.json`. After every
 * crash the contract must never report READY for anything but a verified publication, reconcile must
 * heal only the exact published run, and a normal re-inspection must restore READY.
 *
 *   GRAPHIFY_BACKEND=none node scripts/smoke-crash-recovery.cjs
 *
 * Writes ci-evidence/crash-recovery.json (ignored by Git). Sources, workspace and TCG_CONFIG_HOME are
 * temporary directories.
 */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const repo = resolve(__dirname, '..');
const cli = resolve(repo, 'dist', 'main.js');
const hook = resolve(__dirname, 'test-hooks', 'crash-at.cjs');
const root = mkdtempSync(resolve(tmpdir(), 'tcg crash recovery '));
const env = {
  ...process.env, TCG_CONFIG_HOME: resolve(root, 'config'), GRAPHIFY_BACKEND: 'none', GRAPHIFY_QUERY_LOG_DISABLE: '1',
  GIT_AUTHOR_NAME: 'tcg-smoke', GIT_AUTHOR_EMAIL: 'tcg-smoke@example.invalid', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'tcg-smoke', GIT_COMMITTER_EMAIL: 'tcg-smoke@example.invalid', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};
const points = ['before-pointer-rename', 'truncated-graph-before-pointer', 'torn-pointer', 'after-pointer-rename'];

function tcg(args, crashAt) {
  const result = spawnSync(process.execPath, [...(crashAt ? ['-r', hook] : []), cli, ...args], {
    encoding: 'utf8', env: { ...env, ...(crashAt ? { TCG_TEST_CRASH_AT: crashAt } : {}) }, timeout: 600_000,
  });
  assert.ifError(result.error);
  return { exitCode: result.status, signal: result.signal, stdout: result.stdout.trim(), stderr: result.stderr };
}
function query(workspace) {
  const out = tcg(['technology:query', '--workspace', workspace, '--technology', 'nestjs', '--version', '11',
    '--action', 'query', '--question', 'WelcomeService', '--json']);
  return { exitCode: out.exitCode, ...JSON.parse(out.stdout) };
}
function pointerOf(workspace) {
  const output = resolve(workspace, 'tech-graphify-out', 'technologies', 'nestjs', 'core');
  try { return JSON.parse(readFileSync(resolve(output, 'tcg-current.json'), 'utf8')); } catch { return 'unreadable'; }
}
const source = (i) => [
  'export class WelcomeService {', `  hello(name: string): string { return "Hello ${i}, " + name; }`, '}',
  'export class Caller {', '  useWelcome(): string { return new WelcomeService().hello("Graphify"); }', '}',
  // A code-only graph models symbols, not literals: v2 must add one so its graph differs from v1.
  ...(i > 1 ? [`export class AddedInVersion${i} {}`] : []),
].join('\n');

function scenario(point) {
  const base = resolve(root, point);
  const workspace = resolve(base, 'workspace');
  const src = resolve(base, 'source');
  mkdirSync(src, { recursive: true });
  writeFileSync(resolve(src, 'hello.ts'), source(1));
  execFileSync('git', ['init', '-q'], { cwd: src, env });
  execFileSync('git', ['add', '.'], { cwd: src, env });
  execFileSync('git', ['commit', '-q', '-m', 'v1'], { cwd: src, env });
  assert.equal(tcg(['workspace:create', '--path', workspace, '--name', 'crash', '--non-interactive']).exitCode, 0);
  assert.equal(tcg(['project:add', 'core', src, '--workspace', workspace, '--type', 'technology', '--category', 'backend',
    '--technology', 'nestjs', '--kind', 'core', '--technology-version', '11.0.0', '--ignore-profile', 'common', '--json']).exitCode, 0);
  assert.equal(tcg(['repository:inspect', 'core', '--workspace', workspace, '--no-cluster']).exitCode, 0);
  const first = query(workspace);
  assert.equal(first.status, 'READY');

  // New commit, so the next inspection must extract and publish a new generation; then crash.
  writeFileSync(resolve(src, 'hello.ts'), source(2));
  execFileSync('git', ['commit', '-q', '-am', 'v2'], { cwd: src, env });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
  const crashed = tcg(['repository:inspect', 'core', '--workspace', workspace, '--no-cluster'], point);
  assert.ok(crashed.signal === 'SIGKILL' || (crashed.exitCode !== 0 && crashed.exitCode !== null),
    `${point}: the inspection was expected to be killed (exit ${crashed.exitCode}, signal ${crashed.signal})`);

  // 1. Immediately after the crash: never READY.
  const afterCrash = query(workspace);
  assert.notEqual(afterCrash.status, 'READY', `${point}: READY right after a crash`);
  assert.equal(afterCrash.matches.length, 0);
  assert.equal(afterCrash.sourceRefs.length, 0);

  // 2. Reconcile (as the TUI does at start-up): heals only the exact, complete publication.
  const reconcile = tcg(['repository:reconcile', '--workspace', workspace, '--json']);
  assert.equal(reconcile.exitCode, 0, reconcile.stderr);
  const report = JSON.parse(reconcile.stdout);
  const afterReconcile = query(workspace);
  if (point === 'after-pointer-rename') {
    assert.equal(report.healed.length, 1, `${point}: the complete publication must be healed`);
    assert.equal(afterReconcile.status, 'READY');
    assert.equal(afterReconcile.sourceRefs[0].repositoryCommit, head);
  } else {
    assert.equal(report.healed.length, 0, `${point}: an unpublished or torn run must not be healed`);
    assert.notEqual(afterReconcile.status, 'READY', `${point}: READY without a complete publication`);
  }
  if (afterReconcile.status === 'READY') {
    const output = resolve(workspace, 'tech-graphify-out', 'technologies', 'nestjs', 'core');
    const pointer = pointerOf(workspace);
    const digest = createHash('sha256').update(readFileSync(resolve(output, pointer.graph))).digest('hex');
    assert.equal(afterReconcile.graphHash, digest, `${point}: READY digest is not the pointer's graph`);
  }

  // 3. A normal re-inspection restores READY for the current commit (stale locks of the dead PID recovered).
  const recovered = tcg(['repository:inspect', 'core', '--workspace', workspace, '--no-cluster']);
  assert.equal(recovered.exitCode, 0, `${point}: recovery inspection failed: ${recovered.stderr}${recovered.stdout}`);
  const final = query(workspace);
  assert.equal(final.status, 'READY', `${point}: not READY after recovery: ${JSON.stringify(final.error)}`);
  assert.equal(final.sourceRefs[0].repositoryCommit, head);
  assert.notEqual(final.graphHash, first.graphHash, `${point}: recovery served the pre-crash graph`);
  const leftovers = readdirSync(resolve(workspace, 'tech-graphify-out', 'technologies', 'nestjs', 'core'))
    .filter((name) => name.endsWith('.lock'));
  return {
    point, crashed: { exitCode: crashed.exitCode, signal: crashed.signal },
    afterCrash: { status: afterCrash.status, error: afterCrash.error?.code, exitCode: afterCrash.exitCode },
    reconcile: { healed: report.healed.length, interrupted: report.interrupted.length },
    afterReconcile: { status: afterReconcile.status, error: afterReconcile.error?.code },
    recovered: { status: final.status, graphHash: final.graphHash, commit: final.sourceRefs[0].repositoryCommit },
    lockFilesLeft: leftovers,
  };
}

const evidence = { schemaVersion: '1.0', kind: 'tcg-crash-recovery', outcome: 'FAIL', platform: process.platform, scenarios: [] };
try {
  evidence.graphify = execFileSync('graphify', ['--version'], { encoding: 'utf8' }).trim();
  evidence.tcgCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  for (const point of points) {
    const result = scenario(point);
    evidence.scenarios.push(result);
    console.log(JSON.stringify(result));
  }
  evidence.outcome = 'PASS';
  console.log(JSON.stringify({ outcome: 'PASS', scenarios: evidence.scenarios.length }));
} catch (error) {
  console.error('Crash recovery smoke failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  mkdirSync(resolve(repo, 'ci-evidence'), { recursive: true });
  writeFileSync(resolve(repo, 'ci-evidence', 'crash-recovery.json'), JSON.stringify(evidence, null, 2) + '\n');
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
}
