#!/usr/bin/env node
'use strict';

/**
 * Builds and certifies the versioned technology core graphs listed in technology-graph-targets.v1.json
 * with the compiled TCG CLI and the real Graphify on PATH. Read-only towards upstream: sources are
 * fetched at a pinned commit into --sources. Never run it against a user workspace you have not
 * created for this purpose; the workspace is created when missing.
 *
 *   node scripts/build-technology-graphs.cjs --workspace <dir> --sources <dir> [--only key,key] [--evidence file]
 *
 * Exit 0 only when every selected target is READY for its major, rejects a wrong major (MISSING) and
 * answers a real query and explain. Every measurement in the evidence is observed, never assumed.
 */
const { spawnSync } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { cpus, totalmem, release, platform } = require('node:os');
const { resolve } = require('node:path');

const cli = resolve(__dirname, '..', 'dist', 'main.js');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
  value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1] && !all[index + 1].startsWith('--') ? all[index + 1] : 'true']] : pairs, []));
if (!args.workspace || !args.sources) {
  console.error('Usage: build-technology-graphs.cjs --workspace <dir> --sources <dir> [--only key,key] [--evidence file]');
  process.exit(64);
}
const workspace = resolve(args.workspace);
const sources = resolve(args.sources);
const manifest = JSON.parse(readFileSync(resolve(__dirname, 'technology-graph-targets.v1.json'), 'utf8'));
const only = args.only ? new Set(String(args.only).split(',')) : null;
const env = { ...process.env, GRAPHIFY_BACKEND: process.env.GRAPHIFY_BACKEND ?? 'none', GRAPHIFY_QUERY_LOG_DISABLE: '1' };

function run(command, argv, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, argv, { encoding: 'utf8', env, maxBuffer: 256 * 1024 * 1024, ...options });
  return { exitCode: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ms: Date.now() - started, error: result.error };
}
function tcg(argv, options) { return run(process.execPath, [cli, ...argv], options); }
function git(cwd, argv) {
  const result = run('git', ['-c', 'advice.detachedHead=false', ...argv], { cwd });
  if (result.exitCode !== 0) throw new Error(`git ${argv.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
function json(result) { try { return JSON.parse(result.stdout.trim()); } catch { return null; } }

function ensureSource(target) {
  const checkout = resolve(sources, target.key);
  if (!existsSync(checkout)) {
    mkdirSync(checkout, { recursive: true });
    git(checkout, ['init', '-q']);
    git(checkout, ['remote', 'add', 'origin', target.repository]);
    git(checkout, ['fetch', '-q', '--depth', '1', 'origin', target.commit]);
    git(checkout, ['checkout', '-q', 'FETCH_HEAD']);
  }
  const head = git(checkout, ['rev-parse', 'HEAD']);
  if (head !== target.commit) throw new Error(`${target.key}: checkout is at ${head}, manifest pins ${target.commit}`);
  if (git(checkout, ['status', '--porcelain', '--untracked-files=all'])) throw new Error(`${target.key}: checkout is not clean`);
  return { checkout, sourcePath: target.subpath ? resolve(checkout, target.subpath) : checkout };
}

function graphStats(reference) {
  const output = resolve(workspace, 'tech-graphify-out', 'technologies', reference.technology, reference.repositoryKey);
  const pointer = JSON.parse(readFileSync(resolve(output, 'tcg-current.json'), 'utf8'));
  const graphPath = resolve(output, pointer.graph);
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  return { bytes: statSync(graphPath).size, nodes: graph.nodes?.length ?? null, links: (graph.links ?? graph.edges)?.length ?? null };
}

const evidence = {
  schemaVersion: '1.0', kind: 'tcg-technology-graph-build',
  startedAt: new Date().toISOString(),
  tcg: { sha: run('git', ['rev-parse', 'HEAD'], { cwd: resolve(__dirname, '..') }).stdout.trim(), node: process.version },
  graphify: run('graphify', ['--version']).stdout.trim() || null,
  environment: { platform: platform(), release: release(), cpu: cpus()[0]?.model, cpus: cpus().length, totalMemoryBytes: totalmem() },
  targets: [],
};
let failed = 0;
if (!existsSync(resolve(workspace, 'tech-context-graph.workspace.json'))) {
  const created = tcg(['workspace:create', '--path', workspace, '--name', 'technology-graphs', '--non-interactive']);
  if (created.exitCode !== 0) throw new Error('workspace:create failed: ' + created.stderr);
}
for (const target of manifest.targets) {
  if (only && !only.has(target.key)) continue;
  const major = target.technologyVersion.split('.')[0];
  const record = { key: target.key, technology: target.technology, technologyVersion: target.technologyVersion,
    requestedMajor: major, repository: target.repository, ref: target.ref, commit: target.commit, subpath: target.subpath };
  try {
    const { sourcePath } = ensureSource(target);
    record.trackedFiles = Number(run('git', ['ls-files', '--', '.'], { cwd: sourcePath }).stdout.split('\n').filter(Boolean).length);
    const add = tcg(['project:add', target.key, sourcePath, '--workspace', workspace, '--type', 'technology',
      '--category', target.category, '--technology', target.technology, '--kind', 'core',
      '--technology-version', target.technologyVersion, '--ignore-profile', target.ignoreProfile, '--json']);
    if (add.exitCode !== 0) throw new Error('project:add failed: ' + add.stderr.trim());
    const inspect = tcg(['repository:inspect', target.key, '--workspace', workspace, '--no-cluster'], { timeout: 4 * 60 * 60_000 });
    record.inspect = { exitCode: inspect.exitCode, wallMs: inspect.ms };
    if (inspect.exitCode !== 0) throw new Error('repository:inspect failed: ' + (inspect.stderr || inspect.stdout).trim().slice(-2000));
    const reference = tcg(['technology:reference', '--workspace', workspace, '--technology', target.technology, '--version', major, '--json']);
    record.reference = { exitCode: reference.exitCode, wallMs: reference.ms, body: json(reference) };
    if (record.reference.body?.status !== 'READY') throw new Error('reference not READY');
    if (record.reference.body.repositoryCommit !== target.commit) throw new Error('reference commit differs from the pinned commit');
    record.graph = graphStats(record.reference.body);
    for (const [name, argv] of [
      ['query', ['--action', 'query', '--question', target.question]],
      ['explain', ['--action', 'explain', '--question', target.explain]],
    ]) {
      const result = tcg(['technology:query', '--workspace', workspace, '--technology', target.technology, '--version', major, ...argv, '--json']);
      const body = json(result);
      record[name] = { exitCode: result.exitCode, wallMs: result.ms, status: body?.status, error: body?.error?.code,
        queryDurationMs: body?.queryDurationMs, matchBytes: body?.matches?.[0]?.content?.length ?? 0,
        graphHashMatchesReference: body?.graphHash ? 'sha256:' + body.graphHash === record.reference.body.graphSha256 : false };
      if (body?.status !== 'READY' || !record[name].graphHashMatchesReference) throw new Error(`${name} not READY`);
    }
    const wrong = tcg(['technology:query', '--workspace', workspace, '--technology', target.technology,
      '--version', String(Number(major) + 100), '--action', 'query', '--question', 'x', '--json']);
    record.wrongMajor = { exitCode: wrong.exitCode, status: json(wrong)?.status, error: json(wrong)?.error?.code };
    if (wrong.exitCode !== 4 || record.wrongMajor.error !== 'VERSION_MISMATCH') throw new Error('wrong major was not MISSING/VERSION_MISMATCH');
    record.outcome = 'PASS';
  } catch (error) {
    failed += 1;
    record.outcome = 'FAIL';
    record.failure = error instanceof Error ? error.message : String(error);
  }
  evidence.targets.push(record);
  console.log(JSON.stringify({ key: record.key, outcome: record.outcome, inspectMs: record.inspect?.wallMs,
    nodes: record.graph?.nodes, graphSha256: record.reference?.body?.graphSha256, failure: record.failure }));
}
evidence.finishedAt = new Date().toISOString();
evidence.outcome = failed ? 'FAIL' : 'PASS';
if (args.evidence) writeFileSync(resolve(args.evidence), JSON.stringify(evidence, null, 2) + '\n');
process.exitCode = failed ? 1 : 0;
