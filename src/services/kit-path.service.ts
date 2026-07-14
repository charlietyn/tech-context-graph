import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

@Injectable()
export class KitPathService {
  findKitRoot(): string {
    if (process.env.TCG_KIT_ROOT) {
      return resolve(process.env.TCG_KIT_ROOT);
    }
    const candidates = [process.cwd(), __dirname, resolve(__dirname, '..'), resolve(__dirname, '../..')];
    for (const candidate of candidates) {
      let current = resolve(candidate);
      for (let depth = 0; depth < 8; depth += 1) {
        if (existsSync(resolve(current, 'package.json')) && existsSync(resolve(current, 'config', 'technology-catalog.yaml'))) {
          return current;
        }
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
      }
    }
    throw new Error('Cannot locate the Tech Context Graph package root. Set TCG_KIT_ROOT to the project or installation directory.');
  }
}
