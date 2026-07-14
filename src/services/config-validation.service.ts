import { Injectable } from '@nestjs/common';
import Ajv2020, { ErrorObject, ValidateFunction } from 'ajv/dist/2020';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

@Injectable()
export class WorkspaceConfigValidationService {
  private readonly validateConfiguration: ValidateFunction;

  constructor() {
    const schemaPath = resolve(__dirname, '..', '..', 'config', 'tech-context-graph.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    this.validateConfiguration = ajv.compile(schema);
  }

  validate(config: unknown, source: string): asserts config is Record<string, unknown> {
    if (this.validateConfiguration(config)) return;
    const details = (this.validateConfiguration.errors ?? [])
      .map((error) => this.formatError(error))
      .join('; ');
    throw new Error(`Invalid workspace configuration in ${source}: ${details}`);
  }

  private formatError(error: ErrorObject): string {
    const location = error.instancePath || '/';
    return `${location} ${error.message ?? 'is invalid'}`;
  }
}
