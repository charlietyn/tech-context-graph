import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ProjectAddCommand } from '../src/commands/project.commands';

describe('Explicit versioned core registration', () => {
  function fixture() {
    const workspace = mkdtempSync(resolve(tmpdir(), 'tcg-project-add-'));
    writeFileSync(resolve(workspace, 'tech-context-graph.workspace.json'), '{}');
    const project = resolve(workspace, 'nestjs-core');
    mkdirSync(project);
    const config = {
      load: jest.fn(() => ({ projects: {} })),
      save: jest.fn(),
    };
    const store = { upsertManual: jest.fn() };
    const discovery = { detectRepository: jest.fn(() => null) };
    const graphs = { organize: jest.fn(async () => 0) };
    const command = new ProjectAddCommand(config as never, store as never, discovery as never, graphs as never);
    return { workspace, project, config, store, graphs, command };
  }

  it('persists an explicitly selected approved core version in SQLite and YAML', async () => {
    const f = fixture();
    await f.command.run(['core-10', f.project], {
      workspace: f.workspace, technology: 'nestjs', category: 'backend',
      type: 'technology', kind: 'core', technologyVersion: '10.4.1',
    });
    expect(f.store.upsertManual).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      key: 'core-10', technology: 'nestjs', artifactKind: 'core', technologyVersion: '10.4.1',
    }));
    expect(f.config.save).toHaveBeenCalledWith(f.workspace, expect.objectContaining({
      projects: expect.objectContaining({
        'core-10': expect.objectContaining({ artifact_kind: 'core', technology_version: '10.4.1' }),
      }),
    }));
  });

  it('refuses an unversioned core without writing any state', async () => {
    const f = fixture();
    await expect(f.command.run(['core', f.project], {
      workspace: f.workspace, technology: 'nestjs', kind: 'core',
    })).rejects.toThrow('--technology-version');
    expect(f.store.upsertManual).not.toHaveBeenCalled();
    expect(f.config.save).not.toHaveBeenCalled();
  });
});
