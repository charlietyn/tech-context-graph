import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const schema = JSON.parse(readFileSync(resolve(root, 'docs/contracts/technology-context-result.v1.schema.json'), 'utf8'));
const verify = new Ajv({ allErrors: true }).compile(schema);
const fixture = (status: string) => JSON.parse(readFileSync(resolve(root,
  'test/fixtures/contracts/technology-context/v1/' + status + '.json'), 'utf8'));

describe('CONTRACT-002 producer-consumer JSON schema v1', () => {
  it.each(['ready', 'stale', 'missing', 'failed'])('accepts the %s fixture', (status) => {
    const payload = fixture(status);
    expect(verify(payload)).toBe(true);
  });

  it('rejects a READY without verifiable provenance', () => {
    const payload = fixture('ready');
    payload.sourceRefs = [];
    expect(verify(payload)).toBe(false);
    payload.sourceRefs = [{ repositoryKey: 'forged' }];
    expect(verify(payload)).toBe(false);
  });

  it('rejects future schemas and silent failures', () => {
    const ready = fixture('ready');
    ready.schemaVersion = '2.0';
    expect(verify(ready)).toBe(false);
    const missing = fixture('missing');
    delete missing.error;
    expect(verify(missing)).toBe(false);
  });

  it('plan 28 C1: rejects READY with a null repositoryCommit or without freshnessCheckedAt', () => {
    const noCommit = fixture('ready');
    noCommit.sourceRefs[0].repositoryCommit = null;
    expect(verify(noCommit)).toBe(false);
    const noFreshness = fixture('ready');
    delete noFreshness.freshnessCheckedAt;
    expect(verify(noFreshness)).toBe(false);
    // Non-READY results may still carry a non-Git reference (it is never usable context).
    const stale = fixture('stale');
    stale.sourceRefs = [{ ...fixture('ready').sourceRefs[0], repositoryCommit: null }];
    expect(verify(stale)).toBe(true);
  });
});
