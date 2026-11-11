'use strict';

/**
 * TEST-ONLY preload (`node -r scripts/test-hooks/crash-at.cjs dist/main.js ...`), used by
 * smoke-crash-recovery.cjs. It is never required by TCG itself. When TCG_TEST_CRASH_AT names a
 * point, the process kills itself with SIGKILL at the publication step of `tcg-current.json`, so
 * no catch/finally block runs: exactly what a power cut or OOM kill leaves on disk.
 *
 *   before-pointer-rename          new generation complete, temp pointer written, pointer not replaced
 *   truncated-graph-before-pointer as above, and the new graph.json is left half-written
 *   torn-pointer                   tcg-current.json left half-written (a filesystem without atomic rename)
 *   after-pointer-rename           pointer replaced, SQLite inspection never completed
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { dirname, resolve } = require('node:path');

const point = process.env.TCG_TEST_CRASH_AT;
const die = () => { process.kill(process.pid, 'SIGKILL'); for (;;) { /* until the kernel removes the process */ } };
const halve = (path) => { const data = fs.readFileSync(path); fs.writeFileSync(path, data.subarray(0, Math.floor(data.length / 2))); };

if (point) {
  const rename = fsp.rename;
  fsp.rename = async function patchedRename(from, to, ...rest) {
    const publishing = String(to).endsWith('tcg-current.json') && String(from).endsWith('.tmp');
    if (publishing && point === 'before-pointer-rename') die();
    if (publishing && point === 'truncated-graph-before-pointer') {
      halve(resolve(dirname(String(to)), JSON.parse(fs.readFileSync(from, 'utf8')).graph));
      die();
    }
    if (publishing && point === 'torn-pointer') {
      const data = fs.readFileSync(from);
      fs.writeFileSync(to, data.subarray(0, Math.floor(data.length / 2)));
      die();
    }
    const result = await rename.call(this, from, to, ...rest);
    if (publishing && point === 'after-pointer-rename') die();
    return result;
  };
}
