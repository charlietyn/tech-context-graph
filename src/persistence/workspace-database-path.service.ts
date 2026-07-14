import { Injectable } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { WorkspaceConfigService } from '../services/config.service';

@Injectable()
export class WorkspaceDatabasePathService {
  constructor(
    private readonly config: WorkspaceConfigService = new WorkspaceConfigService(),
  ) {}

  resolve(workspaceRoot: string): string {
    const configuration = this.config.load(workspaceRoot);
    const configured = String(
      configuration.persistence?.file
      ?? configuration.workspace?.paths?.database
      ?? './.tcg/state.sqlite',
    );
    const target = resolve(workspaceRoot, configured);
    mkdirSync(dirname(target), { recursive: true });
    return target;
  }
}
