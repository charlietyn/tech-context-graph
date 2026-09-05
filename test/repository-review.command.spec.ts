import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { RepositoryReviewCommand } from '../src/commands/catalog.commands';

describe('RepositoryReviewCommand --accept-all', () => {
  let workspace: string;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    workspace = mkdtempSync(resolve(tmpdir(), 'tcg-review-all-'));
    writeFileSync(resolve(workspace, 'tech-context-graph.workspace.json'), '{}');
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('accepts every candidate currently awaiting review', async () => {
    const candidates = [{ id: 'candidate-api' }, { id: 'candidate-worker' }];
    const review = {
      listDetected: jest.fn()
        .mockResolvedValueOnce(candidates)
        .mockResolvedValueOnce([]),
      apply: jest.fn().mockResolvedValue({
        accepted: 2,
        ignored: 0,
        failed: 0,
        items: [
          { id: 'candidate-api', key: 'api', status: 'accepted' },
          { id: 'candidate-worker', key: 'worker', status: 'accepted' },
        ],
      }),
    };
    const command = new RepositoryReviewCommand(review as never);

    await command.run([], { workspace, acceptAll: true });

    expect(review.apply).toHaveBeenCalledWith(workspace, ['candidate-api', 'candidate-worker']);
    expect(console.log).toHaveBeenCalledWith('Accepted 2/2 detected candidate(s).');
    expect(process.exitCode).toBeUndefined();
  });

  it('rejects ambiguous combinations with explicit accept or ignore lists', async () => {
    const review = { listDetected: jest.fn(), apply: jest.fn() };
    const command = new RepositoryReviewCommand(review as never);

    await expect(command.run([], { workspace, acceptAll: true, accept: 'candidate-api' }))
      .rejects.toThrow('--accept-all cannot be combined with --accept or --ignore.');

    expect(review.listDetected).not.toHaveBeenCalled();
    expect(review.apply).not.toHaveBeenCalled();
  });
});
