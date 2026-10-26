import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { StoredRepository } from '../src/models/repository-state';
import { RepositoryPullResult } from '../src/services/repository-git.service';
import { ConsoleUiService } from '../src/ui/console-ui.service';
import { RepositoryUiPresenterService } from '../src/ui/repository-ui-presenter.service';

function repository(key: string, path: string): StoredRepository {
  return {
    id: `id-${key}`,
    key,
    name: key,
    path,
    sourcePath: resolve(path, 'packages', key),
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
    inspectionStatus: 'STALE',
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

describe('ConsoleUiService batch Git pull + Graphify update', () => {
  it('delegates the all-repositories selection to the shared coordinator', async () => {
    const workspace = mkdtempSync(resolve(tmpdir(), 'tcg-ui-batch-pull-'));
    const sharedPath = resolve(workspace, 'shared-repository');
    const first = repository('api', sharedPath);
    const second = repository('worker', sharedPath);
    const progress = {
      start: jest.fn(),
      stop: jest.fn(),
      error: jest.fn(),
      message: jest.fn(),
      advance: jest.fn(),
    };
    const clack = {
      intro: jest.fn(),
      outro: jest.fn(),
      note: jest.fn(),
      select: jest.fn()
        .mockResolvedValueOnce('pull-inspect')
        .mockResolvedValueOnce('all')
        .mockResolvedValueOnce('exit'),
      autocompleteMultiselect: jest.fn(),
      confirm: jest.fn().mockResolvedValue(true),
      progress: jest.fn().mockReturnValue(progress),
      spinner: jest.fn().mockReturnValue(progress),
      log: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), success: jest.fn() },
    };
    const prompts = {
      load: jest.fn().mockResolvedValue(clack),
      requireValue: jest.fn().mockImplementation(async (value: unknown) => value),
    };
    const repositories = { list: jest.fn().mockResolvedValue([first, second]), invalidate: jest.fn(), refreshInBackground: jest.fn().mockResolvedValue(undefined) };
    const graphify = {
      isAvailable: jest.fn().mockReturnValue(true),
      version: jest.fn().mockReturnValue('test'),
      inspect: jest.fn().mockResolvedValue({
        graphPath: resolve(workspace, 'graph.json'),
        nodeCount: 10,
        edgeCount: 12,
        communityCount: 2,
        durationMs: 5,
        notices: [],
        clustered: true,
      }),
    };
    const updates = { run: jest.fn().mockResolvedValue({ outcomes: [], aggregates: [], durationMs: 1, logPath: 'test.log' }) };
    const roots = { list: jest.fn().mockResolvedValue([]) };
    const review = { listDetected: jest.fn().mockResolvedValue([]) };
    const registry = {
      listValid: jest.fn().mockReturnValue([{ name: 'Test workspace', path: workspace }]),
      getRegistryPath: jest.fn().mockReturnValue(resolve(workspace, 'registry.json')),
    };
    const reconciler = { reconcile: jest.fn().mockResolvedValue({ healed: [], interrupted: [] }) };
    const ui = new ConsoleUiService(
      prompts as never,
      repositories as never,
      {} as never,
      graphify as never,
      updates as never,
      roots as never,
      review as never,
      {} as never,
      {} as never,
      registry as never,
      new RepositoryUiPresenterService(),
      reconciler as never,
    );

    await expect(ui.run(workspace)).resolves.toBe('EXIT');

    expect(clack.autocompleteMultiselect).not.toHaveBeenCalled();
    expect(updates.run).toHaveBeenCalledWith(workspace, [first, second], expect.objectContaining({ pull: true }));
    expect(progress.stop).toHaveBeenCalled();
  });
});
