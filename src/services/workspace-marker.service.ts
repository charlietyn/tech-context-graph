import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { WorkspaceMarker } from '../models/workspace';

const MARKER_NAMES = ['tech-context-graph.workspace.json'];

@Injectable()
export class WorkspaceMarkerService {
  markerPath(workspacePath: string): string {
    return resolve(workspacePath, MARKER_NAMES[0]);
  }

  read(workspacePath: string): WorkspaceMarker | undefined {
    for (const name of MARKER_NAMES) {
      const path = resolve(workspacePath, name);
      if (!existsSync(path)) continue;
      try {
        const value = JSON.parse(readFileSync(path, 'utf8')) as WorkspaceMarker;
        if (value?.id && value?.name) return value;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  create(workspacePath: string, values: { id?: string; name: string; createdAt?: string }): WorkspaceMarker {
    const marker: WorkspaceMarker = {
      schemaVersion: 1,
      id: values.id || `WS-${randomUUID()}`,
      name: values.name,
      createdAt: values.createdAt || new Date().toISOString(),
      application: 'tech-context-graph',
    };
    writeFileSync(this.markerPath(workspacePath), JSON.stringify(marker, null, 2) + '\n', 'utf8');
    return marker;
  }

  findFrom(startPath: string): { path: string; marker: WorkspaceMarker } | undefined {
    let current = resolve(startPath);
    for (let depth = 0; depth < 16; depth += 1) {
      const marker = this.read(current);
      if (marker) return { path: current, marker };
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return undefined;
  }

  isLegacyWorkspace(workspacePath: string): boolean {
    return existsSync(resolve(workspacePath, '.tcg', 'state.sqlite'))
      || existsSync(resolve(workspacePath, 'tech-context-graph.yaml'));
  }
}
