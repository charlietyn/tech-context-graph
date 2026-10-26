// Real Graphify smoke test against local temporary Git repositories; no network or real catalog writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const runner = require('../dist/services/process-runner');
const { SqliteDatabaseService } = require('../dist/persistence/sqlite-database.service');
const { RepositoryStoreService } = require('../dist/persistence/repository-store.service');
const { RepositoryGitService } = require('../dist/services/repository-git.service');
const { RepositoryFingerprintService } = require('../dist/services/repository-fingerprint.service');
const { GraphifyCliService } = require('../dist/services/graphify-cli.service');
const { TechnologyGraphService } = require('../dist/services/technology-graph.service');
const { RepositoryUpdateService } = require('../dist/services/repository-update.service');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-real-update-'));
  const seed = path.join(root, 'seed'); fs.mkdirSync(seed);
  const git = async (cwd, args) => {
    const result = await runner.runProcess('git', ['-C', cwd, ...args]);
    assert.equal(result.exitCode, 0, result.stderr); return result.stdout.trim();
  };
  await git(seed, ['init']); await git(seed, ['config', 'user.name', 'TCG Test']); await git(seed, ['config', 'user.email', 'test@example.invalid']);
  for (const key of ['alpha', 'beta']) {
    const source = path.join(seed, 'packages', key); fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, 'index.ts'), `export class ${key} { value(): number { return 1; } }\n`);
    fs.writeFileSync(path.join(source, 'helper.ts'), 'export function helper() { return 1; }\n');
  }
  await git(seed, ['add', '.']); await git(seed, ['commit', '-m', 'fixture']);
  const origin = path.join(root, 'origin.git'); await git(root, ['clone', '--bare', seed, origin]);
  const clone = path.join(root, 'clone'); await git(root, ['clone', origin, clone]);
  const sqlite = new SqliteDatabaseService(); const store = new RepositoryStoreService(sqlite);
  try {
    for (const key of ['alpha', 'beta']) await store.upsertManual(root, {
      key, path: path.join(clone, 'packages', key), role: 'technology', category: 'backend', technology: 'fixture',
    });
    const aggregates = new TechnologyGraphService(store);
    const graphify = new GraphifyCliService(store, new RepositoryFingerprintService());
    const coordinator = new RepositoryUpdateService(new RepositoryGitService(), graphify, aggregates);
    let extracts = 0; let merges = 0; let pulls = 0;
    const actual = runner.runProcess;
    runner.runProcess = async (command, args, options) => {
      if (command === 'graphify' && args[0] === 'extract') extracts++;
      if (command === 'graphify' && args[0] === 'merge-graphs') merges++;
      if (command === 'git' && args.includes('pull')) pulls++;
      return actual(command, args, options);
    };
    const first = await coordinator.run(root, await store.list(root), { pull: true, noCluster: true });
    assert(first.outcomes.every((r) => r.ok), JSON.stringify(first));
    assert(first.aggregates.every((r) => r.status === 'UPDATED'), JSON.stringify(first));
    assert.equal(extracts, 2); assert.equal(merges, 1); assert.equal(pulls, 1);
    extracts = merges = pulls = 0;
    const second = await coordinator.run(root, await store.list(root), { pull: true, noCluster: true });
    assert(second.outcomes.every((r) => r.status === 'UNCHANGED'), JSON.stringify(second));
    assert.equal(extracts, 0); assert.equal(merges, 0); assert.equal(pulls, 1);
    fs.writeFileSync(path.join(clone, 'packages', 'alpha', 'index.ts'), 'export class alpha { value() { return 2; } extra() { return 3; } }\n');
    const third = await coordinator.run(root, await store.list(root), { noCluster: true });
    assert(third.outcomes.every((r) => r.ok), JSON.stringify(third));
    assert.equal(extracts, 1); assert.equal(merges, 1);
    const result = { root, firstMs: first.durationMs, unchangedMs: second.durationMs, incrementalMs: third.durationMs,
      unchanged: { extracts: 0, merges: 0, pulls: 1 }, changedSource: { extracts, merges },
      graphify: await graphify.version(), logs: [first.logPath, second.logPath, third.logPath] };
    fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { sqlite.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
