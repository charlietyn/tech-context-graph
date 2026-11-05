'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { resolve } = require('node:path');

const executable = resolve(__dirname, '..', 'dist', 'main.js');
function run(extra, code, expectedError) {
  const result = spawnSync(process.execPath, [
    executable, 'technology:query',
    '--workspace', resolve(tmpdir(), 'tcg-cli-smoke-workspace-does-not-exist'),
    '--technology', 'nestjs', '--version', '10', '--action', 'query',
    '--question', 'Where are DTO validators?', '--json', ...extra,
  ], { encoding: 'utf8', timeout: 20000 });
  assert.ifError(result.error);
  assert.equal(result.status, code, 'unexpected exit status: ' + result.stderr);
  const stdout = result.stdout.trim();
  const payload = JSON.parse(stdout);
  assert.equal(payload.schemaVersion, '1.0');
  assert.equal(payload.status, 'FAILED');
  assert.equal(payload.error.code, expectedError);
  assert.equal(payload.sourceRefs.length, 0);
  assert.equal(payload.matches.length, 0);
  // Any debug banner or extra JSON breaks the documented one-object transport.
  assert.equal(stdout, JSON.stringify(payload));
  assert.ok(!stdout.includes('ERROR: '));
}
run([], 2, 'INVALID_INPUT');
console.log('CONTRACT-002 CLI JSON output, exit status and error smoke passed');
