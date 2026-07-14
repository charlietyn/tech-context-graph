export interface WorkspaceReference {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastOpenedAt?: string;
}

export interface WorkspaceRegistry {
  version: number;
  lastWorkspaceId?: string;
  recentPaths: string[];
  workspaces: WorkspaceReference[];
}

export interface WorkspaceMarker {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  application: 'tech-context-graph';
}

export type WorkspaceResolutionSource = 'cli' | 'environment' | 'marker' | 'registry' | 'interactive';

export interface WorkspaceResolution {
  status: 'RESOLVED' | 'SELECTION_REQUIRED' | 'NOT_CONFIGURED';
  workspace?: WorkspaceReference;
  source?: WorkspaceResolutionSource;
}
