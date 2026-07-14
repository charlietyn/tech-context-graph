import { Injectable } from '@nestjs/common';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { ScanRootRecord } from '../models/repository-state';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { RepositoryRootConfig, WorkspaceConfigService } from './config.service';
import { RepositoryControlService } from './repository-control.service';

@Injectable()
export class RepositoryRootService {
  constructor(
    private readonly store: RepositoryStoreService,
    private readonly config: WorkspaceConfigService,
    private readonly repositories: RepositoryControlService,
  ) {}

  async add(workspaceRoot: string, values: {
    path: string;
    maxDepth?: number;
    minConfidence?: number;
    role?: string;
    enabled?: boolean;
  }): Promise<ScanRootRecord> {
    const path = resolve(values.path);
    if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`Repository root does not exist or is not a directory: ${path}`);
    const rootConfig: RepositoryRootConfig = {
      path,
      enabled: values.enabled !== false,
      max_depth: values.maxDepth ?? 7,
      min_confidence: values.minConfidence ?? 60,
      role: values.role ?? 'technology',
    };
    await this.store.upsertRoot(workspaceRoot, {
      path,
      maxDepth: rootConfig.max_depth,
      minConfidence: rootConfig.min_confidence,
      role: rootConfig.role,
      enabled: rootConfig.enabled,
    });
    this.config.upsertRepositoryRoot(workspaceRoot, rootConfig);
    return (await this.list(workspaceRoot)).find((item) => resolve(item.path).toLowerCase() === path.toLowerCase())!;
  }

  async list(workspaceRoot: string): Promise<ScanRootRecord[]> {
    const databaseRoots = await this.store.roots(workspaceRoot);
    const configured = this.config.listRepositoryRoots(workspaceRoot);
    for (const item of configured) {
      if (!databaseRoots.some((root) => resolve(root.path).toLowerCase() === resolve(item.path).toLowerCase()) && existsSync(item.path)) {
        await this.store.upsertRoot(workspaceRoot, {
          path: item.path,
          maxDepth: item.max_depth,
          minConfidence: item.min_confidence,
          role: item.role,
          enabled: item.enabled,
        });
      }
    }
    return this.store.roots(workspaceRoot);
  }

  async scan(workspaceRoot: string, rootId: string): Promise<any> {
    const root = (await this.list(workspaceRoot)).find((item) => item.id === rootId || resolve(item.path).toLowerCase() === resolve(rootId).toLowerCase());
    if (!root) throw new Error(`Repository root not found: ${rootId}`);
    if (!root.enabled) throw new Error(`Repository root is disabled: ${root.path}`);
    return this.repositories.scan(workspaceRoot, root.path, {
      maxDepth: root.maxDepth,
      minConfidence: root.minConfidence,
      role: root.role,
    });
  }

  async setEnabled(workspaceRoot: string, rootId: string, enabled: boolean): Promise<void> {
    const root = (await this.list(workspaceRoot)).find((item) => item.id === rootId);
    if (!root) throw new Error(`Repository root not found: ${rootId}`);
    await this.store.setRootEnabled(workspaceRoot, rootId, enabled);
    this.config.setRepositoryRootEnabled(workspaceRoot, root.path, enabled);
  }

  async remove(workspaceRoot: string, rootId: string): Promise<void> {
    const root = (await this.list(workspaceRoot)).find((item) => item.id === rootId);
    if (!root) throw new Error(`Repository root not found: ${rootId}`);
    await this.store.removeRoot(workspaceRoot, rootId);
    this.config.removeRepositoryRoot(workspaceRoot, root.path);
  }
}
