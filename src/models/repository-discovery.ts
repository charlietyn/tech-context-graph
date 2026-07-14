export interface TechnologyProfile {
  display_name?: string;
  default_category?: string;
  ignore_profile?: string;
  files_any?: string[];
  files_glob_any?: string[];
  package_dependencies_any?: string[];
  composer_require_any?: string[];
  text_markers?: Array<{ file: string; contains_any: string[] }>;
  member_key_aliases?: Record<string, string>;
}

export interface TechnologyCatalog {
  version: number;
  settings: {
    default_max_depth: number;
    default_min_confidence: number;
    maximum_directories: number;
    stop_at_detected_repository: boolean;
    include_unknown_git_repositories: boolean;
    exclude_directories: string[];
    /** When true (default), a container folder whose subfolders are ≥2 projects is
     *  grouped as one composite technology and its children become nested members. */
    compose_members?: boolean;
  };
  category_aliases: Record<string, string>;
  profiles: Record<string, TechnologyProfile>;
}

export interface RepositoryCandidate {
  id: string;
  key: string;
  name: string;
  path: string;
  relative_path: string;
  role: string;
  category: string;
  technology: string;
  technology_label: string;
  confidence: number;
  markers: string[];
  git_repository: boolean;
  ignore_profile: string;
  graph_output: string;
  status: 'candidate' | 'registered' | 'skipped';
  warnings: string[];
}

export interface RepositoryDiscoveryReport {
  generated_at: string;
  workspace_root: string;
  scan_root: string;
  role: string;
  max_depth: number;
  min_confidence: number;
  visited_directories: number;
  truncated: boolean;
  candidate_count: number;
  registered_count: number;
  skipped_count: number;
  candidates: RepositoryCandidate[];
}
