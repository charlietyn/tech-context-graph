import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { GlobalWorkspaceRegistryService } from '../src/services/global-workspace-registry.service';
import { WorkspaceMarkerService } from '../src/services/workspace-marker.service';
import { WorkspaceResolverService } from '../src/services/workspace-resolver.service';

const previousConfigHome = process.env.TCG_CONFIG_HOME;

describe('WorkspaceResolverService', () => {
  afterEach(() => {
    if (previousConfigHome === undefined) delete process.env.TCG_CONFIG_HOME;
    else process.env.TCG_CONFIG_HOME = previousConfigHome;
  });

  it('does not silently use the current directory when no marker or registry exists', () => {
    const base = mkdtempSync(resolve(tmpdir(), 'tcg-resolver-'));
    process.env.TCG_CONFIG_HOME = resolve(base, 'config');
    const service = new WorkspaceResolverService(new GlobalWorkspaceRegistryService(), new WorkspaceMarkerService());
    expect(service.resolveNonInteractive(undefined, base).status).toBe('NOT_CONFIGURED');
  });

  it('resolves a workspace from an explicit marker', () => {
    const base = mkdtempSync(resolve(tmpdir(), 'tcg-marker-'));
    process.env.TCG_CONFIG_HOME = resolve(base, 'config');
    const workspace = resolve(base, 'workspace');
    mkdirSync(workspace, { recursive: true });
    new WorkspaceMarkerService().create(workspace, { name: 'Test Workspace' });
    const service = new WorkspaceResolverService(new GlobalWorkspaceRegistryService(), new WorkspaceMarkerService());
    const result = service.fromPath(workspace, 'cli');
    expect(result.status).toBe('RESOLVED');
    expect(result.workspace?.name).toBe('Test Workspace');
  });
});
