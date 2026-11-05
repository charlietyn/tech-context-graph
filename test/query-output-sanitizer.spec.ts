import { sanitizeGraphifyOutput } from '../src/services/query-output-sanitizer';

describe('Graphify output defence-in-depth scrubbing', () => {
  it('removes known workspace paths, bearer and API secret signatures', () => {
    const raw = [
      'Path: C:\\Users\\dev\\workspace\\nestjs\\src\\app.ts',
      'Authorization: Bearer supersecrettoken0000123456',
      'API_KEY=sk-abcdefghijklmnopq1234',
      'password="my-private-password"',
      'Node: Decorator',
    ].join('\n');
    const result = sanitizeGraphifyOutput(raw, ['C:\\Users\\dev\\workspace']);
    expect(result).not.toContain('C:\\Users\\dev\\workspace');
    expect(result).not.toContain('supersecrettoken');
    expect(result).not.toContain('sk-abcdefgh');
    expect(result).not.toContain('my-private');
    expect(result).toContain('Node: Decorator');
    expect(result).toContain('[LOCAL_PATH]');
  });
});
