import { WorkspaceOnboardingService } from '../src/services/workspace-onboarding.service';
import { WorkspaceReference } from '../src/models/workspace';

class FakePromptService {
  readonly clack: any;

  constructor(private readonly values: unknown[]) {
    this.clack = {
      autocomplete: jest.fn(async (_config: any) => this.next()),
      select: jest.fn(async (_config: any) => this.next()),
      text: jest.fn(async (_config: any) => this.next()),
      confirm: jest.fn(async (_config: any) => this.next()),
      note: jest.fn(),
      log: { error: jest.fn() },
      spinner: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    };
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

describe('WorkspaceOnboardingService', () => {
  const workspace: WorkspaceReference = {
    id: 'WS-1',
    name: 'Existing',
    path: '/tmp/existing-workspace',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('returns to the workspace menu when Back is used inside the open flow', async () => {
    const prompts = new FakePromptService(['open', 'exit']);
    const registry = {
      listValid: jest.fn(() => [workspace]),
      markOpened: jest.fn((value: WorkspaceReference) => value),
    };
    const pathSelection = { selectDirectory: jest.fn(async () => undefined) };
    const service = new WorkspaceOnboardingService(
      prompts as any,
      registry as any,
      pathSelection as any,
      {} as any,
      {} as any,
    );

    await expect(service.chooseOrCreate()).resolves.toBeUndefined();

    expect(pathSelection.selectDirectory).toHaveBeenCalledTimes(1);
    expect(prompts.clack.autocomplete).toHaveBeenCalledTimes(2);
    expect(prompts.clack.autocomplete.mock.calls[0][0].message).toBe('Choose a workspace or create/open another one');
    expect(prompts.clack.autocomplete.mock.calls[1][0].message).toBe('Choose a workspace or create/open another one');
  });

  it('disambiguates duplicate workspace names with the folder name', async () => {
    const prompts = new FakePromptService(['exit']);
    const registry = {
      listValid: jest.fn(() => [
        { ...workspace, id: 'WS-1', name: 'Ronu', path: 'D:\\Proyectos\\Grapify\\tech-context-graph' },
        { ...workspace, id: 'WS-2', name: 'Ronu', path: 'D:\\Programacion\\Programacion\\Web\\NPM\\Library' },
      ]),
      markOpened: jest.fn((value: WorkspaceReference) => value),
    };
    const service = new WorkspaceOnboardingService(
      prompts as any,
      registry as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(service.chooseOrCreate()).resolves.toBeUndefined();

    expect(prompts.clack.autocomplete.mock.calls[0][0].options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Ronu · tech-context-graph' }),
        expect.objectContaining({ label: 'Ronu · Library' }),
      ]),
    );
  });

  it('returns to the first-run menu when Back is used before any workspace exists', async () => {
    const prompts = new FakePromptService(['open', 'exit']);
    const registry = { listValid: jest.fn(() => []) };
    const pathSelection = { selectDirectory: jest.fn(async () => undefined) };
    const service = new WorkspaceOnboardingService(
      prompts as any,
      registry as any,
      pathSelection as any,
      {} as any,
      {} as any,
    );

    await expect(service.chooseOrCreate()).resolves.toBeUndefined();

    expect(pathSelection.selectDirectory).toHaveBeenCalledTimes(1);
    expect(prompts.clack.select).toHaveBeenCalledTimes(2);
    expect(prompts.clack.select.mock.calls[0][0].message).toBe('How would you like to continue?');
    expect(prompts.clack.select.mock.calls[1][0].message).toBe('How would you like to continue?');
  });
});
