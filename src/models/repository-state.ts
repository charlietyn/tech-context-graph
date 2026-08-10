import { PackageEcosystem, RepositoryArtifactKind, RepositoryCandidate } from './repository-discovery';

export type InspectionStatus = 'NEVER' | 'RUNNING' | 'READY' | 'STALE' | 'FAILED' | 'MISSING';
export type CatalogStatus = 'DETECTED' | 'ACCEPTED' | 'IGNORED' | 'REJECTED' | 'MISSING';

export interface StoredRepository {
  id: string;
  key: string;
  name: string;
  path: string;
  relativePath: string;
  role: string;
  category: string;
  technology: string;
  technologyLabel: string;
  artifactKind: RepositoryArtifactKind;
  packageEcosystem: PackageEcosystem;
  packageName?: string;
  packageVersion?: string;
  technologyVersion?: string;
  technologyConstraints: string[];
  classificationEvidence: string[];
  confidence: number;
  markers: string[];
  gitRepository: boolean;
  ignoreProfile: string;
  graphOutput: string;
  enabled: boolean;
  catalogStatus: CatalogStatus;
  discoveredAt: string;
  updatedAt: string;
  lastSeenAt: string;
  inspectionStatus: InspectionStatus;
  lastInspectionAt?: string;
  graphJsonPath?: string;
  nodeCount?: number;
  edgeCount?: number;
  lastError?: string;
  sourceFingerprint?: string;
  currentFingerprint?: string;
}

export interface InspectionResult {
  repositoryId: string;
  status: 'READY' | 'FAILED';
  graphOutput: string;
  graphJsonPath?: string;
  nodeCount?: number;
  edgeCount?: number;
  error?: string;
  startedAt: string;
  completedAt: string;
}

export interface ScanRootRecord {
  id: string;
  path: string;
  enabled: boolean;
  maxDepth: number;
  minConfidence: number;
  role: string;
  lastScannedAt?: string;
}

export function candidateToStored(candidate: RepositoryCandidate, now: string): Omit<StoredRepository, 'inspectionStatus'> {
  return {
    id: candidate.id,
    key: candidate.key,
    name: candidate.name,
    path: candidate.path,
    relativePath: candidate.relative_path,
    role: candidate.role,
    category: candidate.category,
    technology: candidate.technology,
    technologyLabel: candidate.technology_label,
    artifactKind: candidate.artifact_kind,
    packageEcosystem: candidate.package_ecosystem,
    packageName: candidate.package_name,
    packageVersion: candidate.package_version,
    technologyVersion: candidate.technology_version,
    technologyConstraints: candidate.technology_constraints,
    classificationEvidence: candidate.classification_evidence,
    confidence: candidate.confidence,
    markers: candidate.markers,
    gitRepository: candidate.git_repository,
    ignoreProfile: candidate.ignore_profile,
    graphOutput: candidate.graph_output,
    enabled: true,
    catalogStatus: candidate.status === 'registered' ? 'ACCEPTED' : 'DETECTED',
    discoveredAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
}
