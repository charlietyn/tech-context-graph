import { StoredRepository } from '../src/models/repository-state';
import { RepositoryInspectCommand } from '../src/commands/repository-control.commands';
import { RepositoryUiPresenterService } from '../src/ui/repository-ui-presenter.service';
import { RepositoryPullResult } from '../src/services/repository-git.service';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

function repository(key: string, path = 'D:\\repositories\\shared'): StoredRepository {
  return {
    id: `id-${key}`,
    key,
    name: key,
    path,
    sourcePath: `${path}\\packages\\${key}`,
    relativePath: '.',
    role: 'technology',
    category: 'backend',
    technology: 'nestjs',
    technologyLabel: 'NestJS',
    artifactKind: 'core',
    packageEcosystem: 'npm',
    technologyConstraints: [],
    classificationEvidence: [],
    confidence: 100,
    markers: [],
    gitRepository: true,
    ignoreProfile: 'nestjs',
    graphOutput: `./tech-graphify-out/technologies/nestjs/${key}`,
    enabled: true,
    catalogStatus: 'ACCEPTED',
    discoveredAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    inspectionStatus: 'NEVER',
  };
}

function pullResult(item: StoredRepository): RepositoryPullResult {
  return {
    repositoryKey: item.key,
    repositoryPath: item.path,
    repositoryRoot: item.path,
    branch: 'main',
    upstream: 'origin/main',
    beforeCommit: '1111111111111111111111111111111111111111',
    afterCommit: '2222222222222222222222222222222222222222',
    changed: true,
    output: 'Updating source',
    durationMs: 10,
  };
}

describe('RepositoryInspectCommand --pull', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let workspace: string;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;
    workspace = mkdtempSync(resolve(tmpdir(), 'tcg-inspect-command-'));
    writeFileSync(resolve(workspace, 'tech-context-graph.workspace.json'), '{}');
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('does not start Graphify when git pull fails', async () => {
    const item = repository('core');
    const repositories = { get: jest.fn().mockResolvedValue(item) };
    const graphify = { inspect: jest.fn() };
    const git = { pull: jest.fn().mockRejectedValue(new Error('working tree has local changes')) };
    const command = new RepositoryInspectCommand(
      repositories as never,
      graphify as never,
      new RepositoryUiPresenterService(),
      git as never,
    );

    await command.run(['core'], { workspace, pull: true });

    expect(git.pull).toHaveBeenCalledWith(item);
    expect(graphify.inspect).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('pulls a shared original folder once and inspects every selected source folder', async () => {
    const first = repository('core');
    const second = repository('common');
    const repositories = { get: jest.fn().mockImplementation(async (_workspace: string, key: string) => key === 'core' ? first : second) };
    const graphify = { inspect: jest.fn().mockResolvedValue({
      graphPath: 'D:\\graphs\\graph.json',
      nodeCount: 10,
      edgeCount: 12,
      communityCount: 2,
      durationMs: 5,
      notices: [],
      clustered: true,
    }) };
    const git = { pull: jest.fn().mockResolvedValue(pullResult(first)) };
    const command = new RepositoryInspectCommand(
      repositories as never,
      graphify as never,
      new RepositoryUiPresenterService(),
      git as never,
    );

    await command.run(['core', 'common'], { workspace, pull: true });

    expect(git.pull).toHaveBeenCalledTimes(1);
    expect(graphify.inspect).toHaveBeenCalledTimes(2);
    expect(graphify.inspect.mock.calls[0][1].sourcePath).toBe(first.sourcePath);
    expect(graphify.inspect.mock.calls[1][1].sourcePath).toBe(second.sourcePath);
    expect(process.exitCode).toBeUndefined();
  });
});
