/** CONTRACT-002: TCG is a read-only technology-knowledge producer, never a business-policy authority. */
export type TechnologyQueryAction = 'query' | 'explain' | 'path';
export type TechnologyQueryStatus = 'READY' | 'STALE' | 'MISSING' | 'FAILED';
export type TechnologyQueryErrorCode =
  | 'INVALID_INPUT' | 'VERSION_MISMATCH' | 'GRAPH_MISSING' | 'STALE_GRAPH'
  | 'INTEGRITY_FAILED' | 'TIMEOUT' | 'GRAPHIFY_UNAVAILABLE' | 'QUERY_FAILED'
  | 'SOURCE_CHANGED' | 'OUTPUT_TOO_LARGE';

export interface TechnologyQueryRequestV1 {
  schemaVersion: '1.0';
  technology: string;
  versionConstraint: string;
  question: string;
  action: TechnologyQueryAction;
  secondNode?: string;
  graphRevision?: string;
  maxResults: number;
  correlationId?: string;
}

export interface TechnologySourceRefV1 {
  repositoryId: string;
  repositoryKey: string;
  repositoryCommit: string | null;
  sourceFingerprint: string;
  graphDigestSha256: string;
  graphifyVersion: string;
  publishedAt: string;
  pointerInspectionId: string;
  fileRef?: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface TechnologyContextResultV1 {
  schemaVersion: '1.0';
  status: TechnologyQueryStatus;
  technology: string;
  requestedVersion: string;
  resolvedVersion?: string;
  graphHash?: string;
  inspectionAt?: string;
  freshnessCheckedAt?: string;
  sourceRefs: TechnologySourceRefV1[];
  matches: Array<{ content: string; references: number[]; confidence: 'SOURCE' | 'INDEX' | 'INFERRED' }>;
  warnings: string[];
  correlationId?: string;
  queryDurationMs: number;
  error?: { code: TechnologyQueryErrorCode; retryable: boolean; message: string };
}

export class TechnologyContextError extends Error {
  constructor(
    public readonly code: TechnologyQueryErrorCode,
    message: string,
    public readonly status: TechnologyQueryStatus = 'FAILED',
    public readonly retryable = false,
  ) { super(message); this.name = 'TechnologyContextError'; }
}

/** CLI values are untrusted strings; validation is independent of Commander and of Graphify. */
export function normalizeTechnologyQuery(input: Partial<TechnologyQueryRequestV1>): TechnologyQueryRequestV1 {
  const invalid = (message: string): never => { throw new TechnologyContextError('INVALID_INPUT', message); };
  if (input.schemaVersion !== undefined && input.schemaVersion !== '1.0') invalid('Unsupported request schema version.');
  if (typeof input.technology !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(input.technology)) invalid('Invalid technology catalog ID.');
  if (typeof input.versionConstraint !== 'string' || !/^(?:\^|~)?\d+(?:\.(?:\d+|x)){0,2}$/.test(input.versionConstraint)) invalid('A concrete technology version/major is required.');
  if (input.action !== 'query' && input.action !== 'explain' && input.action !== 'path') invalid('Unsupported graph action.');
  if (typeof input.question !== 'string' || !input.question.trim() || Buffer.byteLength(input.question, 'utf8') > 2048) invalid('Question/node must have 1..2048 UTF-8 bytes.');
  if (input.action === 'path' && (typeof input.secondNode !== 'string' || !input.secondNode.trim() || Buffer.byteLength(input.secondNode, 'utf8') > 2048)) invalid('Path requires a second node of 1..2048 UTF-8 bytes.');
  if (input.graphRevision !== undefined && (typeof input.graphRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.graphRevision))) invalid('Revision must be a 64-character SHA-256 digest.');
  const maxResults = input.maxResults ?? 5;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20) invalid('maxResults must be between 1 and 20.');
  if (input.correlationId !== undefined && (typeof input.correlationId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.correlationId))) invalid('Invalid correlation ID.');
  return {
    schemaVersion: '1.0',
    technology: input.technology!, versionConstraint: input.versionConstraint!,
    question: input.question!.trim(), action: input.action!, secondNode: input.secondNode?.trim(),
    graphRevision: input.graphRevision, maxResults, correlationId: input.correlationId,
  };
}
