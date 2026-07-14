import { resolve } from 'node:path';
import { GraphifyIgnoreService } from '../src/services/graphify-ignore.service';
import { KitPathService } from '../src/services/kit-path.service';

describe('GraphifyIgnoreService', () => {
  it('merges global production-noise rules with technology-specific rules', () => {
    process.env.TCG_KIT_ROOT = resolve(__dirname, '..');
    const service = new GraphifyIgnoreService(new KitPathService());

    const patterns = service.patterns('primevue');

    expect(patterns).toContain('**/node_modules/');
    expect(patterns).toContain('**/*.test.*');
    expect(patterns).toContain('/apps/');
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it('sanitizes profile names before resolving files', () => {
    process.env.TCG_KIT_ROOT = resolve(__dirname, '..');
    const service = new GraphifyIgnoreService(new KitPathService());

    expect(service.patterns('../primevue')).toContain('/apps/');
  });
});
