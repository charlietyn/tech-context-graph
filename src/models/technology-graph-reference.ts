import { TechnologyContextResultV1, TechnologyQueryErrorCode, TechnologyQueryStatus } from './technology-context-result';

/**
 * CONTRACT-003 `TechnologyGraphReferenceV1`: the one versioned way to point at a TCG technology graph.
 *
 * It is the shape PCX stores in a TaskContextPack and DBIG seals in an architecture lock. It names
 * WHICH bytes (`graphSha256` over the immutable core publication), WHERE they came from
 * (`repositoryCommit` + `sourceFingerprint`) and WHEN TCG last verified them (`freshnessCheckedAt`).
 * A reference is technology context only: it never authorizes business, WorkUnits or agents.
 *
 * Field correspondence (no renaming of meaning):
 *   CONTRACT-002 `graphHash`/`sourceRefs[0].graphDigestSha256` (bare hex) -> `graphSha256` (`sha256:<hex>`)
 *   CONTRACT-002 `sourceRefs[0].publishedAt`                              -> `publishedAt`
 *   DBIG `VerifiedTechGraphReference.graphSha256` / `generatedAt`         <- `graphSha256` / `publishedAt`
 * DBIG must take these values from TCG; a digest DBIG computes over a different file (an aggregate
 * `graph.json`) is a different artifact and never equals this reference.
 */
export const TECHNOLOGY_GRAPH_REFERENCE_SCHEMA = 'argens.technology-graph-reference' as const;

export interface TechnologyGraphReferenceV1 {
  schema: typeof TECHNOLOGY_GRAPH_REFERENCE_SCHEMA;
  schemaVersion: '1.0';
  producer: 'tech-context-graph';
  status: TechnologyQueryStatus;
  technology: string;
  requestedVersion: string;
  resolvedVersion?: string;
  /** Always the immutable, version-specific core publication; never a family aggregate. */
  graphArtifact?: 'core-publication';
  graphSha256?: string;
  publishedAt?: string;
  inspectionId?: string;
  graphifyVersion?: string;
  repositoryKey?: string;
  repositoryCommit?: string;
  sourceFingerprint?: string;
  freshnessCheckedAt?: string;
  error?: { code: TechnologyQueryErrorCode; retryable: boolean; message: string };
}

const HEX64 = /^[a-f0-9]{64}$/;

/**
 * Projects a CONTRACT-002 result to CONTRACT-003. Only a READY result with exactly one consistent
 * source reference yields a READY reference; anything else keeps its non-READY status and carries
 * no graph identity, so a consumer can never seal an unverified digest.
 */
export function technologyGraphReferenceFromResult(result: TechnologyContextResultV1): TechnologyGraphReferenceV1 {
  const base: TechnologyGraphReferenceV1 = {
    schema: TECHNOLOGY_GRAPH_REFERENCE_SCHEMA, schemaVersion: '1.0', producer: 'tech-context-graph',
    status: result.status, technology: result.technology, requestedVersion: result.requestedVersion,
  };
  if (result.status !== 'READY') {
    return { ...base, error: result.error ?? { code: 'QUERY_FAILED', retryable: false, message: 'Not READY.' } };
  }
  const source = result.sourceRefs.length === 1 ? result.sourceRefs[0] : undefined;
  if (!source || !result.graphHash || !HEX64.test(result.graphHash) || source.graphDigestSha256 !== result.graphHash ||
      !source.repositoryCommit || !result.resolvedVersion || !result.freshnessCheckedAt) {
    return { ...base, status: 'FAILED',
      error: { code: 'INTEGRITY_FAILED', retryable: false, message: 'READY result lacks consistent graph provenance.' } };
  }
  return {
    ...base, resolvedVersion: result.resolvedVersion, graphArtifact: 'core-publication',
    graphSha256: `sha256:${result.graphHash}`, publishedAt: source.publishedAt,
    inspectionId: source.pointerInspectionId, graphifyVersion: source.graphifyVersion,
    repositoryKey: source.repositoryKey, repositoryCommit: source.repositoryCommit,
    sourceFingerprint: source.sourceFingerprint, freshnessCheckedAt: result.freshnessCheckedAt,
  };
}

/** `sha256:<hex>` (CONTRACT-003, DBIG) -> bare hex (CONTRACT-002 `graphHash`, `--revision`). */
export function bareGraphDigest(graphSha256: string): string | null {
  const match = /^sha256:([a-f0-9]{64})$/.exec(graphSha256);
  return match ? match[1] : null;
}
