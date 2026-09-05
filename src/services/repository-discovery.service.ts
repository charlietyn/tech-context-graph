import { Injectable } from '@nestjs/common';
import {
  Dirent,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import {
  RepositoryCandidate,
  RepositoryDiscoveryReport,
  TechnologyCatalog,
  TechnologyProfile,
} from '../models/repository-discovery';
import { TechnologyCatalogService } from './technology-catalog.service';
import { WorkspaceConfigService } from './config.service';
import { technologyMemberGraphOutput } from './graph-output-path';
import {
  classifyRepositoryManifest,
  packageKey,
  readRepositoryManifest,
} from './repository-manifest.service';

export interface DiscoverRepositoriesOptions {
  maxDepth?: number;
  minConfidence?: number;
  role?: string;
  apply?: boolean;
  saveRoot?: boolean;
}

@Injectable()
export class RepositoryDiscoveryService {
  constructor(
    private readonly catalogs: TechnologyCatalogService,
    private readonly configService: WorkspaceConfigService,
  ) {}

  discover(workspaceRoot: string, scanRootInput: string, options: DiscoverRepositoriesOptions = {}): RepositoryDiscoveryReport {
    const scanRoot = resolve(scanRootInput);
    if (!existsSync(scanRoot) || !statSync(scanRoot).isDirectory()) {
      throw new Error(`The global folder does not exist or is not a directory: ${scanRoot}`);
    }
    const catalog = this.catalogs.load(workspaceRoot);
    const maxDepth = options.maxDepth ?? catalog.settings.default_max_depth;
    const minConfidence = options.minConfidence ?? catalog.settings.default_min_confidence;
    const role = options.role ?? 'technology';
    const excluded = new Set(catalog.settings.exclude_directories.map((item) => item.toLowerCase()));
    const candidates: RepositoryCandidate[] = [];
    const queue: Array<{ path: string; depth: number }> = [{ path: scanRoot, depth: 0 }];
    let visited = 0;
    let truncated = false;

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited >= catalog.settings.maximum_directories) {
        truncated = true;
        break;
      }
      visited += 1;
      let entries: Dirent[];
      try {
        entries = readdirSync(current.path, { withFileTypes: true });
      } catch {
        continue;
      }
      const detection = this.detectDirectory(scanRoot, current.path, entries, catalog, role, minConfidence);
      if (detection) candidates.push(detection);
      const shouldStop = Boolean(detection && catalog.settings.stop_at_detected_repository);
      if (shouldStop || current.depth >= maxDepth) continue;
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        if (excluded.has(entry.name.toLowerCase())) continue;
        queue.push({ path: resolve(current.path, entry.name), depth: current.depth + 1 });
      }
    }

    this.groupCompositeMembers(candidates, catalog);
    this.ensureUniqueKeys(candidates);
    const report: RepositoryDiscoveryReport = {
      generated_at: new Date().toISOString(),
      workspace_root: resolve(workspaceRoot),
      scan_root: scanRoot,
      role,
      max_depth: maxDepth,
      min_confidence: minConfidence,
      visited_directories: visited,
      truncated,
      candidate_count: candidates.length,
      registered_count: 0,
      skipped_count: 0,
      candidates,
    };
    if (options.apply) this.apply(workspaceRoot, report);
    if (options.saveRoot) this.saveDiscoveryRoot(workspaceRoot, scanRoot, maxDepth, role);
    this.writeReport(workspaceRoot, report);
    return report;
  }

  /** Detect exactly one repository without walking children; used by automation-friendly manual add. */
  detectRepository(
    workspaceRoot: string,
    directoryInput: string,
    options: Pick<DiscoverRepositoriesOptions, 'minConfidence' | 'role'> = {},
  ): RepositoryCandidate | null {
    const directory = resolve(directoryInput);
    if (!existsSync(directory) || !statSync(directory).isDirectory()) return null;
    const catalog = this.catalogs.load(workspaceRoot);
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return null;
    }
    const candidate = this.detectDirectory(
      directory,
      directory,
      entries,
      catalog,
      options.role ?? 'technology',
      options.minConfidence ?? catalog.settings.default_min_confidence,
    );
    if (candidate) this.ensureUniqueKeys([candidate]);
    return candidate;
  }

  readLatest(workspaceRoot: string): RepositoryDiscoveryReport {
    const path = resolve(workspaceRoot, 'context-pack', 'repository-discovery', 'repository-candidates.json');
    if (!existsSync(path)) throw new Error('No previous discovery report exists. Run tcg project:discover <folder>.');
    return JSON.parse(readFileSync(path, 'utf8')) as RepositoryDiscoveryReport;
  }

  apply(workspaceRoot: string, report: RepositoryDiscoveryReport): void {
    const config = this.configService.load(workspaceRoot);
    config.projects ??= {};
    let registered = 0;
    let skipped = 0;
    for (const candidate of report.candidates) {
      if (config.projects[candidate.key]) {
        candidate.status = 'skipped';
        candidate.warnings.push('An entry with the same key already exists in tech-context-graph.yaml.');
        skipped += 1;
        continue;
      }
      config.projects[candidate.key] = {
        type: candidate.role,
        category: candidate.category,
        technology: candidate.technology,
        path: candidate.path,
        source_path: candidate.path,
        graph_output: candidate.graph_output,
        ignore_profile: candidate.ignore_profile,
        enabled: true,
        discovery: {
          candidate_id: candidate.id,
          confidence: candidate.confidence,
          markers: candidate.markers,
          detected_at: report.generated_at,
          scan_root: report.scan_root,
        },
      };
      candidate.status = 'registered';
      registered += 1;
    }
    report.registered_count = registered;
    report.skipped_count = skipped;
    this.configService.save(workspaceRoot, config);
  }

  private detectDirectory(
    scanRoot: string,
    directory: string,
    entries: Dirent[],
    catalog: TechnologyCatalog,
    role: string,
    minConfidence: number,
  ): RepositoryCandidate | null {
    const names = new Set(entries.map((entry) => entry.name.toLowerCase()));
    const gitRepository = names.has('.git');
    const manifest = readRepositoryManifest(directory);
    const scores: Array<{ technology: string; score: number; markers: string[] }> = [];
    for (const [technology, profile] of Object.entries(catalog.profiles)) {
      const result = this.scoreProfile(directory, entries, profile, manifest);
      if (result.score > 0) scores.push({ technology, ...result });
    }
    scores.sort((a, b) => b.score - a.score || a.technology.localeCompare(b.technology));
    let best = scores[0];
    if ((!best || best.score < minConfidence) && gitRepository && catalog.settings.include_unknown_git_repositories) {
      best = { technology: 'unknown', score: 55, markers: ['.git'] };
    }
    if (!best || best.score < Math.min(minConfidence, best.technology === 'unknown' ? 55 : minConfidence)) return null;
    const profile = catalog.profiles[best.technology] ?? {};
    const classification = classifyRepositoryManifest(manifest, profile, { repositoryName: basename(directory) });
    const category = classification.artifactKind === 'library'
      ? 'library'
      : this.inferCategory(directory, scanRoot, catalog, profile.default_category ?? 'subsystem');
    const key = this.proposeKey(directory, best.technology, profile, classification);
    const detectedRole = classification.artifactKind === 'core'
      ? 'technology'
      : classification.artifactKind === 'library'
        ? 'library'
        : classification.artifactKind === 'application' && role === 'technology'
          ? 'application'
          : role;
    const graphBase = role === 'technology' ? './tech-graphify-out/technologies' : './tech-graphify-out';
    const warnings: string[] = [];
    if (!gitRepository) warnings.push('No .git directory was found; detection was based on technology files.');
    if (best.technology === 'unknown') warnings.push('Git repository with no recognized technology; manual classification is required.');
    return {
      id: `REPO-CAND-${createHash('sha1').update(directory.toLowerCase()).digest('hex').slice(0, 10).toUpperCase()}`,
      key,
      name: classification.packageName ?? profile.display_name ?? best.technology,
      path: directory,
      relative_path: relative(scanRoot, directory) || '.',
      role: detectedRole,
      category,
      technology: best.technology,
      technology_label: profile.display_name ?? best.technology,
      artifact_kind: classification.artifactKind,
      package_ecosystem: classification.packageEcosystem,
      package_name: classification.packageName,
      package_version: classification.packageVersion,
      technology_version: classification.technologyVersion,
      technology_constraints: classification.technologyConstraints,
      classification_evidence: classification.evidence,
      confidence: Math.min(100, best.score),
      markers: [...new Set([...best.markers, ...classification.evidence])],
      git_repository: gitRepository,
      ignore_profile: profile.ignore_profile ?? 'common',
      graph_output: `${graphBase}/${key}`,
      status: 'candidate',
      warnings,
    };
  }

  private scoreProfile(
    directory: string,
    entries: Dirent[],
    profile: TechnologyProfile,
    manifest = readRepositoryManifest(directory),
  ): { score: number; markers: string[] } {
    const entryNames = entries.map((entry) => entry.name);
    const lowerNames = new Set(entryNames.map((name) => name.toLowerCase()));
    let score = 0;
    const markers: string[] = [];
    for (const file of profile.files_any ?? []) {
      if (lowerNames.has(file.toLowerCase())) {
        score += 35;
        markers.push(file);
      }
    }
    for (const pattern of profile.files_glob_any ?? []) {
      const matching = entryNames.find((name) => this.matchesSimpleGlob(name, pattern));
      if (matching) {
        score += 30;
        markers.push(matching);
      }
    }
    const manifestIdentities = new Set([
      ...(profile.core_package_names_any ?? []),
      ...(profile.library_package_names_any ?? []),
    ]);
    if (manifest.name && manifestIdentities.has(manifest.name)) {
      score += 90;
      markers.push(`manifest-name:${manifest.name}`);
    }
    if ((profile.core_repository_names_any ?? [])
      .some((name) => name.toLowerCase() === basename(directory).toLowerCase())) {
      score += 85;
      markers.push(`repository-name:${basename(directory)}`);
    }
    const manifestDependencies = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
    const manifestDependencyMatches = manifestDependencies.filter((dependency) =>
      (profile.maven_dependencies_any ?? []).includes(dependency)
      || (profile.dependency_prefixes_any ?? []).some((prefix) => dependency.startsWith(prefix)));
    if (manifestDependencyMatches.length > 0) {
      score += 75;
      markers.push(...manifestDependencyMatches.map((dependency) => `manifest-dependency:${dependency}`));
    }
    const packagePath = resolve(directory, 'package.json');
    const npmIdentities = [...new Set([
      ...(profile.package_dependencies_any ?? []),
      ...(profile.core_package_names_any ?? []),
    ])];
    if (existsSync(packagePath) && (npmIdentities.length || profile.dependency_prefixes_any?.length)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, any>;
        const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
        const packageName = typeof pkg.name === 'string' ? pkg.name : undefined;
        const packageNameMatch = packageName && npmIdentities.includes(packageName) ? packageName : undefined;
        const dependencyMatches = npmIdentities.filter(
          (dependency) => dependency !== packageNameMatch && Object.prototype.hasOwnProperty.call(dependencies, dependency),
        );
        const prefixMatches = Object.keys(dependencies).filter((dependency) =>
          (profile.dependency_prefixes_any ?? []).some((prefix) => dependency.startsWith(prefix)));
        if (packageNameMatch) {
          score += 90;
          markers.push(`package-name:${packageNameMatch}`);
        }
        const allDependencyMatches = [...new Set([...dependencyMatches, ...prefixMatches])];
        if (allDependencyMatches.length > 0) {
          score += 70 + Math.min(15, (allDependencyMatches.length - 1) * 5);
          markers.push(...allDependencyMatches.map((item) => `package:${item}`));
        }
      } catch {
        // Invalid file: the entire discovery process is not aborted.
      }
    }
    const composerPath = resolve(directory, 'composer.json');
    if (existsSync(composerPath) && (
      profile.composer_require_any?.length
      || profile.core_package_names_any?.length
      || profile.dependency_prefixes_any?.length
      || profile.composer_extra_any?.length
    )) {
      try {
        const composer = JSON.parse(readFileSync(composerPath, 'utf8')) as Record<string, any>;
        const requirements = { ...(composer.require ?? {}), ...(composer['require-dev'] ?? {}) };
        const packageName = typeof composer.name === 'string' ? composer.name : undefined;
        const coreName = packageName && profile.core_package_names_any?.includes(packageName) ? packageName : undefined;
        if (coreName) {
          score += 90;
          markers.push(`composer-name:${coreName}`);
        }
        const exact = profile.composer_require_any ?? [];
        const found = Object.keys(requirements).filter((dependency) =>
          exact.includes(dependency)
          || (profile.dependency_prefixes_any ?? []).some((prefix) => dependency.startsWith(prefix)));
        if (found.length > 0) {
          score += 75;
          markers.push(...found.map((item) => `composer:${item}`));
        }
        const extras = composer.extra && typeof composer.extra === 'object' ? composer.extra : {};
        const extraFound = (profile.composer_extra_any ?? [])
          .filter((key) => Object.prototype.hasOwnProperty.call(extras, key));
        if (extraFound.length > 0) {
          score += 65;
          markers.push(...extraFound.map((key) => `composer-extra:${key}`));
        }
      } catch {
        // Invalid file: any other markers are preserved.
      }
    }
    for (const textMarker of profile.text_markers ?? []) {
      const path = resolve(directory, textMarker.file);
      if (!existsSync(path)) continue;
      try {
        const text = readFileSync(path, 'utf8').slice(0, 1_000_000).toLowerCase();
        const found = textMarker.contains_any.find((value) => text.includes(value.toLowerCase()));
        if (found) {
          score += 65;
          markers.push(`${textMarker.file}:${found}`);
        }
      } catch {
        // The marker cannot be read; continue checking other profiles.
      }
    }
    return { score, markers: [...new Set(markers)] };
  }

  private inferCategory(directory: string, scanRoot: string, catalog: TechnologyCatalog, fallback: string): string {
    const segments = relative(scanRoot, directory).split(/[\\/]+/).filter(Boolean);
    for (const segment of segments) {
      const normalized = segment.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (catalog.category_aliases[normalized]) return catalog.category_aliases[normalized];
    }
    return fallback;
  }

  private proposeKey(
    directory: string,
    technology: string,
    profile: TechnologyProfile = {},
    classification?: ReturnType<typeof classifyRepositoryManifest>,
  ): string {
    if (classification?.artifactKind === 'core') {
      return `${technology}-core-${classification.technologyVersion ?? 'unknown'}`;
    }
    const folder = this.slug(basename(directory));
    const memberAlias = profile.member_key_aliases?.[folder];
    if (classification?.artifactKind === 'library' && memberAlias) return memberAlias;
    if (classification?.artifactKind === 'library' && classification.packageName) {
      return packageKey(classification.packageName);
    }
    if (memberAlias) return memberAlias;
    if (technology === 'unknown') return folder || 'repository';
    const aliases = new Set([technology, technology.replace(/js$/, ''), 'nest', 'framework', 'source', 'src']);
    if (!folder || aliases.has(folder)) return technology;
    if (/^v?\d+(?:[-.]\d+)*$/.test(folder)) return `${technology}-${folder.replace(/^v/, '')}`;
    return folder.includes(technology) ? folder : `${technology}-${folder}`;
  }

  private ensureUniqueKeys(candidates: RepositoryCandidate[]): void {
    const used = new Map<string, number>();
    for (const candidate of candidates) {
      const count = used.get(candidate.key) ?? 0;
      used.set(candidate.key, count + 1);
      if (count > 0) candidate.key = `${candidate.key}-${count + 1}`;
      const memberOf = this.memberTechnology(candidate);
      const technology = memberOf ?? (candidate.technology !== 'unknown' ? candidate.technology : undefined);
      candidate.graph_output = technology
        ? technologyMemberGraphOutput(technology, candidate.key)
        : `./tech-graphify-out/${candidate.key}`;
    }
  }

  private memberTechnology(candidate: RepositoryCandidate): string | undefined {
    return candidate.markers.find((marker) => marker.startsWith('member_of:'))?.slice('member_of:'.length);
  }

  /**
   * Groups a "container" folder (one that is not a project itself but whose immediate
   * subfolders are ≥2 detected projects) into a single composite technology, nesting each
   * child under `technologies/<technology>/<member>`. This is the automatic version of what
   * the `vue` catalog profile's `member_key_aliases` describes: e.g. `.../Vue/Vue/{core,
   * router,pinia}` becomes the Vue technology composed of three members. Heterogeneous or
   * unrecognizable containers are left untouched — grouping never guesses across technologies.
   */
  private groupCompositeMembers(candidates: RepositoryCandidate[], catalog: TechnologyCatalog): void {
    if (catalog.settings.compose_members === false) return;
    const normalize = (path: string): string => resolve(path).toLowerCase();
    const candidatePaths = new Set(candidates.map((candidate) => normalize(candidate.path)));
    const byParent = new Map<string, RepositoryCandidate[]>();
    for (const candidate of candidates) {
      const parent = dirname(resolve(candidate.path));
      const siblings = byParent.get(parent) ?? [];
      siblings.push(candidate);
      byParent.set(parent, siblings);
    }
    for (const [parentPath, children] of byParent) {
      if (children.length < 2) continue;
      if (candidatePaths.has(normalize(parentPath))) continue; // the container is itself a project
      const composite = this.resolveCompositeTechnology(parentPath, children, catalog);
      if (!composite) continue;
      for (const child of children) {
        const folder = this.slug(basename(child.path));
        const alias = composite.profile?.member_key_aliases?.[folder];
        const reclassified = classifyRepositoryManifest(
          readRepositoryManifest(child.path),
          composite.profile ?? {},
          { repositoryName: basename(child.path) },
        );
        child.technology = composite.id;
        child.technology_label = composite.label;
        child.artifact_kind = reclassified.artifactKind;
        child.package_ecosystem = reclassified.packageEcosystem;
        child.package_name = reclassified.packageName;
        child.package_version = reclassified.packageVersion;
        child.technology_version = reclassified.technologyVersion;
        child.technology_constraints = reclassified.technologyConstraints;
        child.classification_evidence = reclassified.evidence;
        if (reclassified.artifactKind === 'core') {
          child.key = `${composite.id}-core-${reclassified.technologyVersion ?? 'unknown'}`;
        } else if (reclassified.artifactKind === 'library' && reclassified.packageName) {
          child.key = packageKey(reclassified.packageName);
        } else if (alias) {
          child.key = alias;
        }
        child.role = reclassified.artifactKind === 'core'
          ? 'technology'
          : reclassified.artifactKind === 'library'
            ? 'library'
            : child.role;
        if (reclassified.artifactKind === 'library') child.category = 'library';
        child.markers = [...new Set([...child.markers, ...reclassified.evidence])];
        child.ignore_profile = composite.profile?.ignore_profile ?? child.ignore_profile;
        if (!child.markers.includes(`member_of:${composite.id}`)) child.markers.push(`member_of:${composite.id}`);
        child.warnings.push(`Grouped as a member of the composite technology '${composite.label}' (container folder '${basename(parentPath)}').`);
      }
    }
  }

  private resolveCompositeTechnology(
    parentPath: string,
    children: RepositoryCandidate[],
    catalog: TechnologyCatalog,
  ): { id: string; label: string; profile?: TechnologyProfile } | undefined {
    const profiles = catalog.profiles;
    // 1) The container folder name is itself a known technology (e.g. .../Vue/Vue).
    const folderSlug = this.slug(basename(parentPath));
    if (folderSlug && profiles[folderSlug]) {
      return { id: folderSlug, label: profiles[folderSlug].display_name ?? folderSlug, profile: profiles[folderSlug] };
    }
    // 2) A profile whose member_key_aliases explicitly cover ≥2 of the child folders.
    for (const [id, profile] of Object.entries(profiles)) {
      if (!profile.member_key_aliases) continue;
      const matched = children.filter((child) => profile.member_key_aliases![this.slug(basename(child.path))]).length;
      if (matched >= 2) return { id, label: profile.display_name ?? id, profile };
    }
    // 3) Every child already resolved to the same real (non-unknown) technology.
    const technologies = new Set(children.map((child) => child.technology).filter((technology) => technology && technology !== 'unknown'));
    if (technologies.size === 1) {
      const id = [...technologies][0];
      const label = profiles[id]?.display_name ?? children.find((child) => child.technology === id)!.technology_label;
      return { id, label, profile: profiles[id] };
    }
    // Heterogeneous or unrecognizable container: do not guess.
    return undefined;
  }

  private writeReport(workspaceRoot: string, report: RepositoryDiscoveryReport): void {
    const directory = resolve(workspaceRoot, 'context-pack', 'repository-discovery');
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'repository-candidates.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
    writeFileSync(resolve(directory, 'repository-candidates.yaml'), stringify(report, { indent: 2 }), 'utf8');
    const lines = [
      '# Detected repositories',
      '',
      `- Scanned folder: \`${report.scan_root}\``,
      `- Directories visited: ${report.visited_directories}`,
      `- Candidates: ${report.candidate_count}`,
      `- Registrados: ${report.registered_count}`,
      `- Scan truncated: ${report.truncated ? 'yes' : 'no'}`,
      '',
      '| Proposed key | Technology | Category | Confidence | Git | Path | Status |',
      '|---|---|---|---:|---|---|---|',
      ...report.candidates.map((item) => `| ${item.key} | ${item.technology_label} | ${item.category} | ${item.confidence}% | ${item.git_repository ? 'yes' : 'no'} | ${item.path.replace(/\|/g, '\\|')} | ${item.status} |`),
      '',
      '## What to do next',
      '',
      '1. Review this table and confirm that each path represents a real repository.',
      '2. Correct any ambiguous candidate manually.',
      '3. Run `tcg project:discover <path> --apply` to register trusted candidates.',
      '4. Run `tcg project:list` and then `tcg graph:code`.',
      '',
    ];
    writeFileSync(resolve(directory, 'REPOSITORY_DISCOVERY.md'), lines.join('\n'), 'utf8');
  }

  private saveDiscoveryRoot(workspaceRoot: string, scanRoot: string, maxDepth: number, role: string): void {
    const config = this.configService.load(workspaceRoot);
    config.repository_discovery ??= {};
    config.repository_discovery.roots ??= [];
    const exists = config.repository_discovery.roots.some((item: any) => resolve(item.path) === resolve(scanRoot));
    if (!exists) config.repository_discovery.roots.push({ path: scanRoot, enabled: true, max_depth: maxDepth, role });
    this.configService.save(workspaceRoot, config);
  }

  private matchesSimpleGlob(filename: string, pattern: string): boolean {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i').test(filename);
  }

  private slug(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
