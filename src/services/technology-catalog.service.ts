import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { TechnologyCatalog } from '../models/repository-discovery';
import { KitPathService } from './kit-path.service';

@Injectable()
export class TechnologyCatalogService {
  constructor(private readonly kitPath: KitPathService) {}

  load(workspaceRoot: string): TechnologyCatalog {
    const basePath = resolve(this.kitPath.findKitRoot(), 'config', 'technology-catalog.yaml');
    if (!existsSync(basePath)) throw new Error(`Technology catalog not found: ${basePath}`);
    const base = parse(readFileSync(basePath, 'utf8')) as TechnologyCatalog;
    const overridePath = resolve(workspaceRoot, 'technology-catalog.override.yaml');
    if (!existsSync(overridePath)) return base;
    const override = parse(readFileSync(overridePath, 'utf8')) as Partial<TechnologyCatalog>;
    return this.deepMerge(base, override) as TechnologyCatalog;
  }

  private deepMerge(target: unknown, source: unknown): unknown {
    if (Array.isArray(source)) return [...source];
    if (!source || typeof source !== 'object') return source ?? target;
    const output: Record<string, unknown> = {
      ...((target && typeof target === 'object' && !Array.isArray(target)) ? target as Record<string, unknown> : {}),
    };
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      output[key] = this.deepMerge(output[key], value);
    }
    return output;
  }
}
