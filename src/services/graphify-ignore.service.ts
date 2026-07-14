import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { KitPathService } from './kit-path.service';

@Injectable()
export class GraphifyIgnoreService {
  constructor(private readonly kitPath: KitPathService) {}

  patterns(profile: string): string[] {
    const root = resolve(this.kitPath.findKitRoot(), 'ignore');
    const safeProfile = basename(profile || 'common');
    const files = [resolve(root, 'common.graphifyignore')];
    const profilePath = resolve(root, `${safeProfile}.graphifyignore`);
    if (safeProfile !== 'common') files.push(profilePath);
    const patterns: string[] = [];
    for (const path of files) {
      if (!existsSync(path)) continue;
      for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        patterns.push(line);
      }
    }
    return [...new Set(patterns)];
  }
}
