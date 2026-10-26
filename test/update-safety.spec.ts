import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { RepositoryGitService } from '../src/services/repository-git.service';
import { runGit, classifyGitError } from '../src/services/git-access';
import { prepareExclusions } from '../src/services/repository-exclusions';
import { RepositoryFingerprintService } from '../src/services/repository-fingerprint.service';
import { runProcess } from '../src/services/process-runner';
import { acquireLock } from '../src/services/operation-lock';
import { RepositoryUpdateService } from '../src/services/repository-update.service';
import { StoredRepository } from '../src/models/repository-state';
import { SqliteDatabaseService } from '../src/persistence/sqlite-database.service';
import * as gitAccess from '../src/services/git-access';

jest.setTimeout(60_000);

function git(path: string, ...args: string[]): string {
  const result = spawnSync('git', ['-c', `safe.directory=${path.replace(/\\/g, '/')}`, '-C', path, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'tcg-safe-'));
  const seed = resolve(root, 'seed'); mkdirSync(seed);
  git(seed, 'init'); git(seed, 'config', 'user.name', 'Test'); git(seed, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(resolve(seed, '.gitignore'), 'node_modules/\n');
  writeFileSync(resolve(seed, 'code.ts'), 'export const value = 1;\n');
  git(seed, 'add', '.'); git(seed, 'commit', '-m', 'initial');
  const origin = resolve(root, 'origin.git'); git(root, 'clone', '--bare', seed, origin);
  const clone = resolve(root, 'clone'); git(root, 'clone', origin, clone);
  git(clone, 'config', 'user.name', 'Test'); git(clone, 'config', 'user.email', 'test@example.invalid');
  return { root, seed, clone, origin };
}
function repository(path: string, key: string): StoredRepository {
  return { id: key, key, path, sourcePath: path, catalogStatus: 'ACCEPTED', enabled: true, technology: 'test',
    graphOutput: `./graphs/${key}`, inspectionStatus: 'NEVER', ignoreProfile: 'common' } as StoredRepository;
}

describe('Git exclusions, worktrees and fingerprints', () => {
  it('migrates only the exact TCG footer, ignores artifacts and is idempotent', async () => {
    const f = fixture();
    writeFileSync(resolve(f.clone, '.gitignore'), 'node_modules/\n\n# Tech Context Graph local state\n.tcg/logs/\n.tcg/*.tmp\n');
    mkdirSync(resolve(f.clone, 'graphify-out')); writeFileSync(resolve(f.clone, 'graphify-out/graph.json'), '{}');
    const service = new RepositoryGitService();
    const result = await service.pull(repository(f.clone, 'repo'));
    expect(result.changed).toBe(false);
    expect(result.notices?.join(' ')).toContain('Backup:');
    expect(readFileSync(resolve(f.clone, '.gitignore'), 'utf8').replace(/\r\n/g, '\n')).toBe('node_modules/\n');
    const exclude = resolve(f.clone, git(f.clone, 'rev-parse', '--git-path', 'info/exclude'));
    const rules = readFileSync(exclude, 'utf8');
    await service.pull(repository(f.clone, 'repo'));
    expect(readFileSync(exclude, 'utf8')).toBe(rules);
    expect(git(f.clone, 'status', '--porcelain')).toBe('');
  });

  it('preserves staged and unstaged user changes and ambiguous ignore rules', async () => {
    const f = fixture();
    writeFileSync(resolve(f.clone, '.gitignore'), 'node_modules/\nprivate/\n');
    git(f.clone, 'add', '.gitignore');
    writeFileSync(resolve(f.clone, '.gitignore'), 'node_modules/\nprivate/\ngraphify-out/\n');
    const staged = git(f.clone, 'diff', '--cached');
    const disk = readFileSync(resolve(f.clone, '.gitignore'));
    await expect(new RepositoryGitService().pull(repository(f.clone, 'repo'))).rejects.toMatchObject({ code: 'LOCAL_CHANGES' });
    expect(git(f.clone, 'diff', '--cached')).toBe(staged);
    expect(readFileSync(resolve(f.clone, '.gitignore'))).toEqual(disk);
  });

  it('does not hide versioned generated artifacts', async () => {
    const f = fixture();
    mkdirSync(resolve(f.clone, 'graphify-out')); writeFileSync(resolve(f.clone, 'graphify-out/graph.json'), '{}');
    git(f.clone, 'add', '.'); git(f.clone, 'commit', '-m', 'tracked graph');
    writeFileSync(resolve(f.clone, 'graphify-out/graph.json'), '{"local":true}');
    await expect(new RepositoryGitService().pull(repository(f.clone, 'repo'))).rejects.toMatchObject({ code: 'LOCAL_CHANGES' });
    expect(git(f.clone, 'diff')).toContain('local');
  });

  it('resolves local excludes in a linked worktree and trusts only the concrete root', async () => {
    const f = fixture(); const worktree = resolve(f.root, 'linked');
    git(f.clone, 'worktree', 'add', '-b', 'linked', worktree);
    await prepareExclusions(worktree);
    const expected = resolve(worktree, git(worktree, 'rev-parse', '--git-path', 'info/exclude'));
    expect(readFileSync(expected, 'utf8')).toContain('/graphify-out/');
    const result = await runGit(worktree, ['rev-parse', '--show-toplevel'], { env: { GIT_TEST_ASSUME_DIFFERENT_OWNER: '1' } });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().replace(/\\/g, '/')).toBe(worktree.replace(/\\/g, '/'));
  });

  it('hashes changed content even when Git status text stays identical', async () => {
    const f = fixture(); const service = new RepositoryFingerprintService();
    writeFileSync(resolve(f.clone, 'code.ts'), 'export const value = 2;');
    const a = await service.calculate({ sourcePath: f.clone });
    writeFileSync(resolve(f.clone, 'code.ts'), 'export const value = 3;');
    expect(await service.calculate({ sourcePath: f.clone })).not.toBe(a);
    const b = await service.calculate({ sourcePath: f.clone });
    writeFileSync(resolve(f.clone, 'new.ts'), 'export const other = 1;');
    expect(await service.calculate({ sourcePath: f.clone })).not.toBe(b);
  });

  it('does not treat a broken Git repository as a non-Git folder', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-broken-git-')); mkdirSync(resolve(root, '.git'));
    await expect(new RepositoryFingerprintService().calculate({ sourcePath: root })).rejects.toThrow('Cannot read Git HEAD');
  });

  it('classifies actionable Git failures', () => {
    expect(classifyGitError('detected dubious ownership')).toBe('OWNERSHIP');
    expect(classifyGitError('Authentication failed')).toBe('AUTHENTICATION');
    expect(classifyGitError('Permission denied')).toBe('PERMISSION');
    expect(classifyGitError('Could not resolve host')).toBe('NETWORK');
    expect(classifyGitError('Not possible to fast-forward')).toBe('DIVERGED');
  });

  it('rejects detached HEAD without changing it', async () => {
    const f = fixture(); git(f.clone, 'checkout', '--detach');
    const before = git(f.clone, 'rev-parse', 'HEAD');
    await expect(new RepositoryGitService().pull(repository(f.clone, 'a'))).rejects.toMatchObject({ code: 'DETACHED_HEAD' });
    expect(git(f.clone, 'rev-parse', 'HEAD')).toBe(before);
  });

  it('retries transient network failures once but not authentication errors', async () => {
    const f = fixture(); const original = gitAccess.runGit; let calls = 0;
    const spy = jest.spyOn(gitAccess, 'runGit').mockImplementation(async (path, args, options) => {
      if (args[0] === 'pull' && ++calls === 1) return { exitCode: 128, stdout: '', stderr: 'Could not resolve host', durationMs: 1 };
      return original(path, args, options);
    });
    try {
      await new RepositoryGitService().pull(repository(f.clone, 'a')); expect(calls).toBe(2);
      calls = 0;
      spy.mockImplementation(async (path, args, options) => {
        if (args[0] === 'pull') { calls++; return { exitCode: 128, stdout: '', stderr: 'Authentication failed', durationMs: 1 }; }
        return original(path, args, options);
      });
      await expect(new RepositoryGitService().pull(repository(f.clone, 'a'))).rejects.toMatchObject({ code: 'AUTHENTICATION' });
      expect(calls).toBe(1);
    } finally { spy.mockRestore(); }
  });
});

describe('Process lifetime and locks', () => {
  it('times out and closes a child', async () => {
    await expect(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 }))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
  });
  it('cancels without leaving the process alive', async () => {
    const controller = new AbortController(); let pid: number | undefined;
    const promise = runProcess(process.execPath, ['-e', 'console.log(process.pid);setInterval(()=>{},1000)'], {
      signal: controller.signal, onLine: (line) => { pid = Number(line); controller.abort(); },
    });
    await expect(promise).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(pid).toBeDefined();
    expect(() => process.kill(pid!, 0)).toThrow();
  });
  it('buffers partial lines and propagates consumer failures', async () => {
    const lines: string[] = [];
    await runProcess(process.execPath, ['-e', "process.stdout.write('hel');setTimeout(()=>process.stdout.write('lo\\nlast'),20)"], { onLine: (line) => lines.push(line) });
    expect(lines).toEqual(['hello', 'last']);
    await expect(runProcess(process.execPath, ['-e', 'console.log(1);setInterval(()=>{},1000)'], { onLine: () => { throw new Error('consumer'); } })).rejects.toThrow('consumer');
  });
  it('blocks a second owner and releases after completion', async () => {
    const path = resolve(mkdtempSync(resolve(tmpdir(), 'tcg-lock-')), 'operation.lock');
    const release = await acquireLock(path);
    await expect(acquireLock(path)).rejects.toMatchObject({ code: 'LOCKED' });
    await release(); expect(existsSync(path)).toBe(false);
    await (await acquireLock(path))();
  });

  it('serializes database ownership and shares concurrent initialization', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-db-owner-'));
    const first = new SqliteDatabaseService(); const second = new SqliteDatabaseService();
    try {
      const [a, b] = await Promise.all([first.open(root), first.open(root)]); expect(a).toBe(b);
      await first.run(root, "INSERT INTO settings(key,value,updated_at) VALUES('owner','first','now')");
      await expect(second.open(root)).rejects.toMatchObject({ code: 'LOCKED' });
      first.close();
      expect((await second.get<any>(root, "SELECT value FROM settings WHERE key='owner'"))?.value).toBe('first');
    } finally { first.close(); second.close(); }
  });
});

describe('Shared update coordinator', () => {
  it('deduplicates monorepo roots and aggregates once, including unchanged retries', async () => {
    const f = fixture(); const a = repository(f.clone, 'a'); const b = repository(resolve(f.clone, 'packages'), 'b');
    mkdirSync(b.path); // Empty directory is not a Git change.
    const gitService = new RepositoryGitService(); const pull = jest.spyOn(gitService, 'pull');
    const graphify = { inspect: jest.fn().mockResolvedValue({ unchanged: true, notices: [], nodeCount: 1, edgeCount: 0 }) };
    const aggregates = { refresh: jest.fn().mockResolvedValue({ unchanged: true }) };
    const service = new RepositoryUpdateService(gitService, graphify as never, aggregates as never);
    const report = await service.run(f.root, [a, b], { pull: true });
    expect(pull).toHaveBeenCalledTimes(1); expect(graphify.inspect).toHaveBeenCalledTimes(2);
    expect(aggregates.refresh).toHaveBeenCalledTimes(1);
    expect(report.outcomes.map((row) => row.status)).toEqual(['UNCHANGED', 'UNCHANGED']);
    expect(readFileSync(report.logPath, 'utf8')).toContain('END');
  });

  it('continues after blocked Git and records the failure before extraction', async () => {
    const a = fixture(); const b = fixture();
    writeFileSync(resolve(a.clone, 'code.ts'), 'local');
    const graphify = { inspect: jest.fn().mockResolvedValue({ notices: [], nodeCount: 1, edgeCount: 0 }) };
    const service = new RepositoryUpdateService(new RepositoryGitService(), graphify as never, { refresh: jest.fn() } as never);
    const report = await service.run(a.root, [repository(a.clone, 'a'), repository(b.clone, 'b')], { pull: true });
    expect(report.outcomes.map((row) => row.status)).toEqual(['BLOCKED', 'UPDATED']);
    expect(graphify.inspect).toHaveBeenCalledTimes(1);
    expect(readFileSync(report.logPath, 'utf8')).toContain('LOCAL_CHANGES');
  });

  it('settles a cancelled batch without starting extraction', async () => {
    const f = fixture(); const controller = new AbortController(); controller.abort();
    const graphify = { inspect: jest.fn() };
    const service = new RepositoryUpdateService(new RepositoryGitService(), graphify as never, {} as never);
    const report = await service.run(f.root, [repository(f.clone, 'a')], { signal: controller.signal });
    expect(report.outcomes[0].status).toBe('CANCELLED'); expect(graphify.inspect).not.toHaveBeenCalled();
  });
});
