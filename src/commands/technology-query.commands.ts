import { Command, CommandRunner, Option } from 'nest-commander';
import { TechnologyQueryAction, TechnologyQueryRequestV1 } from '../models/technology-context-result';
import { TechnologyQueryService } from '../services/technology-query.service';
import { TECHNOLOGY_GRAPH_REFERENCE_SCHEMA, TechnologyGraphReferenceV1 } from '../models/technology-graph-reference';
import { resolveWorkspacePath } from './common-options';

interface Options {
  workspace?: string; root?: string; technology?: string; version?: string;
  action?: string; question?: string; to?: string; revision?: string;
  maxResults?: number; correlationId?: string; json?: boolean;
}

/** CONTRACT-002; always a single JSON object on stdout, even on validation failures. */
@Command({ name: 'technology:query', description: 'Read approved versioned technology knowledge as contract v1 JSON.' })
export class TechnologyQueryCommand extends CommandRunner {
  constructor(private readonly queries: TechnologyQueryService) { super(); }

  async run(_args: string[], options: Options): Promise<void> {
    let result;
    try {
      const workspace = resolveWorkspacePath(options.workspace, options.root);
      result = await this.queries.run(workspace, {
        schemaVersion: '1.0', technology: options.technology,
        versionConstraint: options.version, action: options.action as TechnologyQueryAction ?? 'query',
        question: options.question, secondNode: options.to,
        graphRevision: options.revision, maxResults: options.maxResults ?? 5,
        correlationId: options.correlationId,
      } as Partial<TechnologyQueryRequestV1>);
    } catch {
      result = {
        schemaVersion: '1.0' as const, status: 'FAILED' as const, technology: options.technology ?? '',
        requestedVersion: options.version ?? '', sourceRefs: [], matches: [], warnings: [],
        queryDurationMs: 0, error: { code: 'INVALID_INPUT', retryable: false,
          message: 'A valid, explicitly selected TCG workspace is required.' },
      };
    }
    console.log(JSON.stringify(result));
    if (result.status !== 'READY') process.exitCode = result.status === 'STALE' ? 3 : result.status === 'MISSING' ? 4 : 2;
  }

  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--technology <id>' }) parseTechnology(value: string): string { return value; }
  @Option({ flags: '--version <version>' }) parseVersion(value: string): string { return value; }
  @Option({ flags: '--action <action>', description: 'query, explain, or path.' }) parseAction(value: string): string { return value; }
  @Option({ flags: '--question <text>' }) parseQuestion(value: string): string { return value; }
  @Option({ flags: '--to <node>', description: 'Second node for --action path.' }) parseTo(value: string): string { return value; }
  @Option({ flags: '--revision <sha256>' }) parseRevision(value: string): string { return value; }
  @Option({ flags: '--max-results <number>' }) parseMax(value: string): number { return Number(value); }
  @Option({ flags: '--correlation-id <id>' }) parseCorrelation(value: string): string { return value; }
  @Option({ flags: '--json', description: 'JSON output is always used for this command.' }) parseJson(): boolean { return true; }
}

interface ReferenceOptions {
  workspace?: string; root?: string; technology?: string; version?: string; revision?: string; json?: boolean;
}

/**
 * CONTRACT-003; verifies the latest publication like `technology:query` (digest, pointer, source
 * fingerprint, clean Git commit, live Graphify version) but never runs Graphify. Same exit codes.
 */
@Command({ name: 'technology:reference', description: 'Print the verified graph reference (contract v1 JSON) for one technology version.' })
export class TechnologyReferenceCommand extends CommandRunner {
  constructor(private readonly queries: TechnologyQueryService) { super(); }

  async run(_args: string[], options: ReferenceOptions): Promise<void> {
    let result: TechnologyGraphReferenceV1;
    try {
      const workspace = resolveWorkspacePath(options.workspace, options.root);
      result = await this.queries.reference(workspace, {
        schemaVersion: '1.0', technology: options.technology,
        versionConstraint: options.version, graphRevision: options.revision,
      } as Partial<TechnologyQueryRequestV1>);
    } catch {
      result = {
        schema: TECHNOLOGY_GRAPH_REFERENCE_SCHEMA, schemaVersion: '1.0', producer: 'tech-context-graph',
        status: 'FAILED', technology: options.technology ?? '', requestedVersion: options.version ?? '',
        error: { code: 'INVALID_INPUT', retryable: false, message: 'A valid, explicitly selected TCG workspace is required.' },
      };
    }
    console.log(JSON.stringify(result));
    if (result.status !== 'READY') process.exitCode = result.status === 'STALE' ? 3 : result.status === 'MISSING' ? 4 : 2;
  }

  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--technology <id>' }) parseTechnology(value: string): string { return value; }
  @Option({ flags: '--version <version>' }) parseVersion(value: string): string { return value; }
  @Option({ flags: '--revision <sha256>', description: 'Bare hex graph digest the caller has pinned.' }) parseRevision(value: string): string { return value; }
  @Option({ flags: '--json', description: 'JSON output is always used for this command.' }) parseJson(): boolean { return true; }
}
