import * as processRunner from '../src/services/process-runner';
import { GraphifyCliService } from '../src/services/graphify-cli.service';

describe('No implicit Graphify upstream query history', () => {
  it('disables the Graphify global cache log in the child process environment', async () => {
    const spy = jest.spyOn(processRunner, 'runProcess').mockResolvedValue({
      exitCode: 0, stdout: 'Synthetic graph result', stderr: '', durationMs: 1,
    });
    try {
      const client = new GraphifyCliService({} as never, {} as never);
      const output = await client.queryPublished('/published/immutable/graph.json', 'query', 'secret-free question');
      expect(output.output).toBe('Synthetic graph result');
      expect(spy).toHaveBeenCalledWith(
        'graphify',
        ['query', 'secret-free question', '--graph', '/published/immutable/graph.json'],
        expect.objectContaining({
          maxOutputBytes: 64 * 1024,
          env: expect.objectContaining({ GRAPHIFY_QUERY_LOG_DISABLE: '1' }),
        }),
      );
    } finally { spy.mockRestore(); }
  });
});
