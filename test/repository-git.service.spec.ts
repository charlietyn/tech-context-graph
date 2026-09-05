import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { RepositoryGitService } from '../src/services/repository-git.service';

interface GitFixture {
  root: string;
  origin: string;
  seed: string;
  clone: string;
  branch: string;
}

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function configureIdentity(path: string): void {
  git(path, ['config', 'user.email', 'tcg-tests@example.invalid']);
  git(path, ['config', 'user.name', 'TCG Tests']);
}

function createFixture(): GitFixture {
  const root = mkdtempSync(resolve(tmpdir(), 'tcg-git-pull-'));
  const origin = resolve(root, 'origin.git');
  const seed = resolve(root, 'seed');
  const clone = resolve(root, 'clone');
  mkdirSync(seed, { recursive: true });
  git(root, ['init', '--bare', origin]);
  git(root, ['init', seed]);
  configureIdentity(seed);
  writeFileSync(resolve(seed, 'source.txt'), 'version 1\n');
  git(seed, ['add', 'source.txt']);
  git(seed, ['commit', '-m', 'initial']);
  const branch = git(seed, ['branch', '--show-current']);
  git(seed, ['remote', 'add', 'origin', origin]);
  git(seed, ['push', '--set-upstream', 'origin', branch]);
  git(root, ['--git-dir', origin, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`]);
  git(root, ['clone', origin, clone]);
  configureIdentity(clone);
  return { root, origin, seed, clone, branch };
}

function pushChange(fixture: GitFixture, content: string, message: string): void {
  writeFileSync(resolve(fixture.seed, 'source.txt'), content);
  git(fixture.seed, ['add', 'source.txt']);
  git(fixture.seed, ['commit', '-m', message]);
  git(fixture.seed, ['push']);
}

describe('RepositoryGitService', () => {
  const service = new RepositoryGitService();

  it('fast-forwards from the original repository folder and reports an up-to-date retry', async () => {
    const fixture = createFixture();
    pushChange(fixture, 'version 2\n', 'remote update');

    const updated = await service.pull({ key: 'technology-core', path: fixture.clone });

    expect(updated.repositoryPath).toBe(fixture.clone);
    expect(updated.repositoryRoot).toBe(fixture.clone);
    expect(updated.branch).toBe(fixture.branch);
    expect(updated.upstream).toContain(`origin/${fixture.branch}`);
    expect(updated.changed).toBe(true);
    expect(updated.beforeCommit).not.toBe(updated.afterCommit);
    expect(readFileSync(resolve(fixture.clone, 'source.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('version 2\n');

    const unchanged = await service.pull({ key: 'technology-core', path: fixture.clone });
    expect(unchanged.changed).toBe(false);
    expect(unchanged.beforeCommit).toBe(unchanged.afterCommit);
  });

  it('refuses to pull when the working tree has local changes', async () => {
    const fixture = createFixture();
    writeFileSync(resolve(fixture.clone, 'source.txt'), 'local edit\n');

    await expect(service.pull({ key: 'technology-core', path: fixture.clone }))
      .rejects.toThrow(/uncommitted or untracked changes/);
  });

  it('refuses to pull a repository without an upstream branch', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-git-no-upstream-'));
    git(root, ['init']);
    configureIdentity(root);
    writeFileSync(resolve(root, 'source.txt'), 'local only\n');
    git(root, ['add', 'source.txt']);
    git(root, ['commit', '-m', 'local']);

    await expect(service.pull({ key: 'local-only', path: root }))
      .rejects.toThrow(/has no upstream branch/);
  });

  it('refuses to pull a folder that is not a Git repository', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'tcg-not-git-'));

    await expect(service.pull({ key: 'not-git', path: root }))
      .rejects.toThrow(/is not a Git repository/);
  });

  it('does not merge automatically when local and remote branches diverge', async () => {
    const fixture = createFixture();
    writeFileSync(resolve(fixture.clone, 'local.txt'), 'local commit\n');
    git(fixture.clone, ['add', 'local.txt']);
    git(fixture.clone, ['commit', '-m', 'local divergence']);
    pushChange(fixture, 'remote divergence\n', 'remote divergence');

    await expect(service.pull({ key: 'technology-core', path: fixture.clone }))
      .rejects.toThrow(/Git pull failed.*No graph update was started/);
  });
});
