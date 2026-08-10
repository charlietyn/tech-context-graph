import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { GlobalWorkspaceRegistryService } from '../src/services/global-workspace-registry.service';
import { PathSelectionService } from '../src/services/path-selection.service';
import { ClackPromptService } from '../src/ui/clack-prompt.service';

class FakePromptService {
  readonly values: unknown[];
  readonly clack = {
    select: jest.fn(async (_config: any) => this.next()),
    autocomplete: jest.fn(async (_config: any) => this.next()),
    text: jest.fn(async (_config: any) => this.next()),
  };

  constructor(values: unknown[]) {
    this.values = [...values];
  }

  async load(): Promise<any> {
    return this.clack;
  }

  async requireValue<T>(value: T): Promise<T> {
    return value;
  }

  private next(): unknown {
    if (this.values.length === 0) throw new Error('No fake prompt value queued.');
    return this.values.shift();
  }
}

const previousConfigHome = process.env.TCG_CONFIG_HOME;

describe('PathSelectionService', () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (previousConfigHome === undefined) delete process.env.TCG_CONFIG_HOME;
    else process.env.TCG_CONFIG_HOME = previousConfigHome;
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  });

  it('opens selected child folders instead of treating Enter as the final workspace choice', async () => {
    tempRoot = mkdtempSync(resolve(tmpdir(), 'tcg-path-selection-'));
    process.env.TCG_CONFIG_HOME = resolve(tempRoot, 'config');
    const root = resolve(tempRoot, 'D-drive');
    const container = resolve(root, 'Projects');
    const workspace = resolve(container, 'ActualWorkspace');
    mkdirSync(workspace, { recursive: true });

    const prompts = new FakePromptService(['browse', container, workspace, '__tcg_use_current__']);
    const service = new PathSelectionService(
      prompts as unknown as ClackPromptService,
      new GlobalWorkspaceRegistryService(),
    );
    jest.spyOn(service as any, 'selectBrowseRoot').mockResolvedValue(root);

    const selected = await service.selectDirectory({
      title: 'Choose the existing workspace folder',
      allowCreate: false,
      useCurrentLabel: 'Use this folder as the workspace',
    });

    expect(selected).toBe(workspace);
    expect(prompts.clack.autocomplete).toHaveBeenCalledTimes(3);
    expect(prompts.clack.autocomplete.mock.calls[0][0].options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: container, hint: 'Open folder' })]),
    );
    expect(prompts.clack.autocomplete.mock.calls[1][0].options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: workspace, hint: 'Open folder' })]),
    );
    expect(prompts.clack.autocomplete.mock.calls[2][0].options).toEqual(
      expect.arrayContaining([expect.objectContaining({ value: '__tcg_use_current__', label: 'Use this folder as the workspace' })]),
    );
  });

  it('uses a context-specific label when selecting a repository search folder', async () => {
    tempRoot = mkdtempSync(resolve(tmpdir(), 'tcg-repository-root-selection-'));
    process.env.TCG_CONFIG_HOME = resolve(tempRoot, 'config');
    const repositoryRoot = resolve(tempRoot, 'repositories');
    mkdirSync(repositoryRoot, { recursive: true });

    const prompts = new FakePromptService(['browse', '__tcg_use_current__']);
    const service = new PathSelectionService(
      prompts as unknown as ClackPromptService,
      new GlobalWorkspaceRegistryService(),
    );
    jest.spyOn(service as any, 'selectBrowseRoot').mockResolvedValue(repositoryRoot);

    const selected = await service.selectDirectory({
      title: 'Choose the folder tree that contains repositories',
      allowCreate: false,
      useCurrentLabel: 'Use this folder as the repository search folder',
    });

    expect(selected).toBe(repositoryRoot);
    expect(prompts.clack.autocomplete.mock.calls[0][0].options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: '__tcg_use_current__',
          label: 'Use this folder as the repository search folder',
        }),
      ]),
    );
  });

  it('creates a folder during browsing and still requires explicit confirmation of the current folder', async () => {
    tempRoot = mkdtempSync(resolve(tmpdir(), 'tcg-path-create-'));
    process.env.TCG_CONFIG_HOME = resolve(tempRoot, 'config');
    const root = resolve(tempRoot, 'workspace-parent');
    const workspace = resolve(root, 'NewWorkspace');
    mkdirSync(root, { recursive: true });

    const prompts = new FakePromptService(['browse', '__tcg_create__', 'NewWorkspace', '__tcg_use_current__']);
    const service = new PathSelectionService(
      prompts as unknown as ClackPromptService,
      new GlobalWorkspaceRegistryService(),
    );
    jest.spyOn(service as any, 'selectBrowseRoot').mockResolvedValue(root);

    const selected = await service.selectDirectory({
      title: 'Where should Tech Context Graph store its data?',
      allowCreate: true,
    });

    expect(selected).toBe(workspace);
    expect(existsSync(workspace)).toBe(true);
    expect(prompts.clack.autocomplete).toHaveBeenCalledTimes(2);
    expect(prompts.clack.text).toHaveBeenCalledTimes(1);
  });
});
