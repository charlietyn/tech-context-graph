import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { CommandFactory } from 'nest-commander';
import { StoredRepository } from '../src/models/repository-state';
import { RepositoryInspectCommand } from '../src/commands/repository-control.commands';
import { RepositoryControlService } from '../src/services/repository-control.service';
import { RepositoryUpdateService } from '../src/services/repository-update.service';
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

  it('reports failures from the shared coordinator', async () => {
    const item = repository('core');
    const updates = { run: jest.fn().mockResolvedValue({ outcomes: [{ key: 'core', ok: false, status: 'BLOCKED', gitStatus: 'BLOCKED', graphStatus: 'PRESERVED', durationMs: 1, notices: [], errorCode: 'LOCAL_CHANGES', error: 'local changes' }], aggregates: [], durationMs: 1, logPath: 'test.log' }) };
    const command = new RepositoryInspectCommand({ get: jest.fn().mockResolvedValue(item) } as never, updates as never, new RepositoryUiPresenterService());
    await command.run(['core'], { workspace, pull: true });
    expect(updates.run).toHaveBeenCalledWith(workspace, [item], expect.objectContaining({ pull: true }));
    expect(process.exitCode).toBe(1);
  });

  it('supports all through the same coordinator', async () => {
    const items = [repository('core'), repository('common')];
    const updates = { run: jest.fn().mockResolvedValue({ outcomes: [], aggregates: [], durationMs: 1, logPath: 'test.log' }) };
    const command = new RepositoryInspectCommand({ list: jest.fn().mockResolvedValue(items) } as never, updates as never, new RepositoryUiPresenterService());
    await command.run(['all'], { workspace, pull: true });
    expect(updates.run).toHaveBeenCalledWith(workspace, items, expect.objectContaining({ pull: true }));
    expect(process.exitCode).toBeUndefined();
  });

  describe('flags parsed by the real commander', () => {
    const originalArgv = process.argv;
    afterEach(() => { process.argv = originalArgv; });

    async function parsedOptions(...flags: string[]): Promise<Record<string, unknown>> {
      const updates = { run: jest.fn().mockResolvedValue({ outcomes: [], aggregates: [], durationMs: 1, logPath: 'test.log' }) };
      @Module({
        providers: [
          RepositoryInspectCommand,
          RepositoryUiPresenterService,
          { provide: RepositoryControlService, useValue: { get: jest.fn().mockResolvedValue(repository('core')) } },
          { provide: RepositoryUpdateService, useValue: updates },
        ],
      })
      class InspectTestModule {}
      process.argv = ['node', 'tcg', 'repository:inspect', 'core', '--workspace', workspace, ...flags];
      await CommandFactory.run(InspectTestModule, { logger: false });
      return updates.run.mock.calls[0][2];
    }

    it('forwards --no-cluster to the coordinator', async () => {
      expect(await parsedOptions('--no-cluster')).toMatchObject({ noCluster: true });
    });

    it('leaves noCluster undefined without the flag so existing configuration hashes stay valid', async () => {
      expect((await parsedOptions()).noCluster).toBeUndefined();
    });
  });
});
