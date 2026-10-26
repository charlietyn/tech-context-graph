import { Injectable } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorkspaceReference } from '../models/workspace';
import { SqliteDatabaseService } from '../persistence/sqlite-database.service';
import { WorkspaceConfigService } from './config.service';
import { GlobalWorkspaceRegistryService } from './global-workspace-registry.service';
import { WorkspaceMarkerService } from './workspace-marker.service';
import { gitRoot } from './git-access';
import { prepareExclusions } from './repository-exclusions';

@Injectable()
export class WorkspaceInitializerService {
  constructor(
    private readonly markers: WorkspaceMarkerService,
    private readonly registry: GlobalWorkspaceRegistryService,
    private readonly config: WorkspaceConfigService,
    private readonly sqlite: SqliteDatabaseService,
  ) {}

  async create(pathInput: string, name: string): Promise<WorkspaceReference> {
    const path = resolve(pathInput);
    mkdirSync(path, { recursive: true });
    for (const relative of ['.tcg/logs', 'tech-graphify-out/technologies', 'context-pack/repository-discovery']) {
      mkdirSync(resolve(path, relative), { recursive: true });
    }
    const marker = this.markers.read(path) ?? this.markers.create(path, { name });
    this.config.ensureDefault(path, { id: marker.id, name: marker.name });
    await this.sqlite.open(path);
    const repositoryRoot = gitRoot(path);
    if (repositoryRoot) await prepareExclusions(repositoryRoot);
    return this.registry.register({ id: marker.id, name: marker.name, path, createdAt: marker.createdAt });
  }

  async adopt(pathInput: string, name: string): Promise<WorkspaceReference> {
    const path = resolve(pathInput);
    const marker = this.markers.read(path) ?? this.markers.create(path, { name });
    this.config.ensureDefault(path, { id: marker.id, name: marker.name });
    await this.sqlite.open(path);
    return this.registry.register({ id: marker.id, name: marker.name, path, createdAt: marker.createdAt });
  }

}
