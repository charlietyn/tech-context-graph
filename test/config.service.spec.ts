import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WorkspaceDatabasePathService } from '../src/persistence/workspace-database-path.service';
import { WorkspaceConfigService } from '../src/services/config.service';

describe('WorkspaceConfigService', () => {
  it('loads defaults and validates a partial v4 document', () => {
    const root = mkdtempSync(join(tmpdir(), 'tcg-config-'));
    writeFileSync(join(root, 'tech-context-graph.yaml'), 'version: 4\nprojects: {}\n');

    const config = new WorkspaceConfigService().load(root);

    expect(config.workspace.paths.graphs).toBe('./tech-graphify-out');
    expect(config.security.allow_external_llm).toBe(false);
    expect(config.persistence.file).toBe('./.tcg/state.sqlite');
  });

  it('persists the explicit workspace identity instead of generated folder defaults', () => {
    const root = mkdtempSync(join(tmpdir(), 'tcg-config-identity-'));
    const service = new WorkspaceConfigService();

    const config = service.ensureDefault(root, { id: 'WS-EXPLICIT', name: 'Explicit Catalog' });

    expect(config.workspace.id).toBe('WS-EXPLICIT');
    expect(config.workspace.name).toBe('Explicit Catalog');
    expect(service.load(root).workspace.name).toBe('Explicit Catalog');
  });

  it('rejects configuration values that violate the JSON Schema', () => {
    const root = mkdtempSync(join(tmpdir(), 'tcg-config-invalid-'));
    writeFileSync(join(root, 'tech-context-graph.yaml'), 'version: 4\nui:\n  color: sometimes\n');

    expect(() => new WorkspaceConfigService().load(root)).toThrow(/\/ui\/color/);
  });

  it('migrates renamed graph, report, and security properties before validation', () => {
    const root = mkdtempSync(join(tmpdir(), 'tcg-config-legacy-'));
    writeFileSync(join(root, 'tech-context-graph.yaml'), [
      'version: 4',
      'workspace:',
      '  paths:',
      '    graphify_out: ./legacy-graphs',
      '    context_pack: ./legacy-reports',
      'security:',
      '  disable_query_log: true',
    ].join('\n'));

    const config = new WorkspaceConfigService().load(root);

    expect(config.workspace.paths.graphs).toBe('./legacy-graphs');
    expect(config.workspace.paths.reports).toBe('./legacy-reports');
    expect(config.graphify.query_log_disabled).toBe(true);
    expect(config.security.disable_query_log).toBeUndefined();
  });

  it('resolves the SQLite path from persistence.file', () => {
    const root = mkdtempSync(join(tmpdir(), 'tcg-config-database-'));
    mkdirSync(join(root, 'state'), { recursive: true });
    writeFileSync(join(root, 'tech-context-graph.yaml'), 'version: 4\npersistence:\n  file: ./state/custom.sqlite\n');
    const config = new WorkspaceConfigService();

    expect(new WorkspaceDatabasePathService(config).resolve(root)).toBe(resolve(root, 'state', 'custom.sqlite'));
  });
});
