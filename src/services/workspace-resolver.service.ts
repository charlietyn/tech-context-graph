import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorkspaceReference, WorkspaceResolution } from '../models/workspace';
import { GlobalWorkspaceRegistryService } from './global-workspace-registry.service';
import { WorkspaceMarkerService } from './workspace-marker.service';

@Injectable()
export class WorkspaceResolverService {
  constructor(
    private readonly registry: GlobalWorkspaceRegistryService,
    private readonly markers: WorkspaceMarkerService,
  ) {}

  resolveNonInteractive(explicitPath?: string, currentDirectory = process.cwd()): WorkspaceResolution {
    const explicit = explicitPath || process.env.TCG_WORKSPACE;
    if (explicit) return this.fromPath(explicit, explicitPath ? 'cli' : 'environment');

    const markerMatch = this.markers.findFrom(currentDirectory);
    if (markerMatch) {
      return {
        status: 'RESOLVED',
        source: 'marker',
        workspace: {
          id: markerMatch.marker.id,
          name: markerMatch.marker.name,
          path: markerMatch.path,
          createdAt: markerMatch.marker.createdAt,
        },
      };
    }

    const last = this.registry.findLast();
    if (last) return { status: 'RESOLVED', source: 'registry', workspace: last };
    return { status: 'NOT_CONFIGURED' };
  }

  requirePath(explicitPath?: string, currentDirectory = process.cwd()): string {
    const resolution = this.resolveNonInteractive(explicitPath, currentDirectory);
    if (resolution.status !== 'RESOLVED' || !resolution.workspace) {
      throw new Error('No Tech Context Graph workspace is configured. Run "tcg" interactively or pass --workspace <path>.');
    }
    return resolution.workspace.path;
  }

  fromPath(input: string, source: 'cli' | 'environment'): WorkspaceResolution {
    const path = resolve(input);
    if (!existsSync(path)) {
      throw new Error(`The workspace path does not exist: ${path}`);
    }
    const marker = this.markers.read(path);
    if (!marker) {
      throw new Error(`The folder is not a Tech Context Graph workspace: ${path}. Open the interactive UI to adopt or initialize it.`);
    }
    const workspace: WorkspaceReference = {
      id: marker.id,
      name: marker.name,
      path,
      createdAt: marker.createdAt,
      lastOpenedAt: new Date().toISOString(),
    };
    this.registry.markOpened(workspace);
    return { status: 'RESOLVED', source, workspace };
  }
}
