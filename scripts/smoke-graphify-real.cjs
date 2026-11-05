'use strict';

/**
 * Real integration, not a Graphify mock. CI pins graphifyy and writes code-only
 * source exclusively inside OS tmpdir. Graphify is called as its actual Python CLI.
 * There are no model calls, remote repository clones or production workspace writes.
 */
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { RepositoryStoreService } = require('../dist/persistence/repository-store.service');
const { SqliteDatabaseService } = require('../dist/persistence/sqlite-database.service');
const { RepositoryFingerprintService } = require('../dist/services/repository-fingerprint.service');
const { GraphifyCliService } = require('../dist/services/graphify-cli.service');
const { PublishedGraphResolverService } = require('../dist/services/published-graph-resolver.service');
const { TechnologyQueryService } = require('../dist/services/technology-query.service');

async function main() {
  const root = mkdtempSync(resolve(tmpdir(), 'tcg-graphify-real-'));
  const source = resolve(root, 'source');
  mkdirSync(source);
  mkdirSync(resolve(__dirname, '..', 'ci-evidence'), { recursive: true });
  writeFileSync(resolve(source, 'hello.ts'), [
    'export class WelcomeService {',
    '  hello(name: string): string { return "Hello, " + name; }',
    '}',
    'export class Caller {',
    '  useWelcome(): string { return new WelcomeService().hello("Graphify"); }',
    '}',
  ].join('\n'));
  const sqlite = new SqliteDatabaseService();
  const store = new RepositoryStoreService(sqlite);
  const fingerprints = new RepositoryFingerprintService();
  const graphify = new GraphifyCliService(store, fingerprints);
  const evidence = {
    schemaVersion: '1.0', graphify: null, inspected: false, queryStatus: null,
    nodeCount: null, digest: null, repoCommit: null, sourceFingerprint: null,
  };
  try {
    evidence.graphify = execFileSync('graphify', ['--version'], { encoding: 'utf8' }).trim();
    await store.upsertManual(root, {
      key: 'nestjs-core-10',
      path: source, role: 'technology', category: 'backend',
      technology: 'nestjs', artifactKind: 'core', technologyVersion: '10.4.0',
      ignoreProfile: 'common',
    });
    const repository = await store.getByKey(root, 'nestjs-core-10');
    assert.ok(repository, 'manual core missing from catalog');
    assert.equal(repository.technologyVersion, '10.4.0');

    const inspection = await graphify.inspect(root, repository, { noCluster: true, deferAggregate: true });
    assert.ok(inspection.nodeCount > 0, 'Graphify created an empty graph');
    evidence.nodeCount = inspection.nodeCount;
    evidence.inspected = true;

    const resolver = new PublishedGraphResolverService(fingerprints, graphify);
    const query = new TechnologyQueryService(store, resolver, graphify);
    const request = {
      schemaVersion: '1.0', technology: 'nestjs', versionConstraint: '10',
      action: 'query', question: 'WelcomeService', maxResults: 5,
      correlationId: 'ci-graphify-real',
    };
    const ready = await query.run(root, request);
    assert.equal(ready.status, 'READY', JSON.stringify(ready.error));
    assert.ok(ready.sourceRefs.length === 1, 'missing graph provenance');
    assert.ok(ready.graphHash === ready.sourceRefs[0].graphDigestSha256);
    evidence.digest = ready.graphHash;
    evidence.sourceFingerprint = ready.sourceRefs[0].sourceFingerprint;
    evidence.repoCommit = ready.sourceRefs[0].repositoryCommit;
    evidence.queryStatus = ready.status;

    writeFileSync(resolve(source, 'hello.ts'), 'export const changedSource = true;');
    const stale = await query.run(root, request);
    assert.equal(stale.status, 'STALE', JSON.stringify(stale.error));
    assert.ok(!stale.matches.length, 'stale response must not expose Graphify answers');

    evidence.staleAfterSourceChange = stale.status;
    console.log(JSON.stringify({
      outcome: 'PASS', graphify: evidence.graphify, nodes: inspection.nodeCount,
      sha256: evidence.digest, stale: stale.status,
    }));
  } finally {
    sqlite.close();
    writeFileSync(resolve(__dirname, '..', 'ci-evidence', 'graphify-smoke.json'),
      JSON.stringify(evidence, null, 2) + '\n');
    rmSync(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error('Real Graphify integration failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
