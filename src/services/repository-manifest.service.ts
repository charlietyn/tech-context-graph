import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PackageEcosystem,
  RepositoryArtifactKind,
  TechnologyProfile,
} from '../models/repository-discovery';

export interface RepositoryManifest {
  ecosystem: PackageEcosystem;
  name?: string;
  version?: string;
  type?: string;
  private?: boolean;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  extra: Record<string, unknown>;
  buildPlugins: string[];
}

export interface ManifestClassification {
  artifactKind: RepositoryArtifactKind;
  packageEcosystem: PackageEcosystem;
  packageName?: string;
  packageVersion?: string;
  technologyVersion?: string;
  technologyConstraints: string[];
  evidence: string[];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function firstXmlTag(xml: string, tag: string): string | undefined {
  return xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.trim();
}

function xmlBlocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
    .map((match) => match[1]);
}

function readMavenManifest(directory: string): RepositoryManifest | undefined {
  const pomPath = resolve(directory, 'pom.xml');
  if (!existsSync(pomPath)) return undefined;
  try {
    const rootXml = readFileSync(pomPath, 'utf8');
    const parentMatch = rootXml.match(/<parent(?:\s[^>]*)?>([\s\S]*?)<\/parent>/i);
    const parentBlock = parentMatch?.[1] ?? '';
    const projectXml = parentMatch ? rootXml.replace(parentMatch[0], '') : rootXml;
    const coordinateBoundary = projectXml.search(/<(?:properties|modules|dependencyManagement|dependencies|build|profiles)(?:\s|>)/i);
    const coordinatesXml = coordinateBoundary >= 0 ? projectXml.slice(0, coordinateBoundary) : projectXml;
    const groupId = firstXmlTag(coordinatesXml, 'groupId') ?? firstXmlTag(parentBlock, 'groupId');
    const artifactId = firstXmlTag(coordinatesXml, 'artifactId');
    const version = firstXmlTag(coordinatesXml, 'version') ?? firstXmlTag(parentBlock, 'version');
    const relatedXml = [rootXml];
    const parentPom = resolve(directory, 'parent', 'pom.xml');
    if (existsSync(parentPom)) relatedXml.push(readFileSync(parentPom, 'utf8'));
    const dependencies: Record<string, string> = {};
    const buildPlugins = new Set<string>();
    const extra: Record<string, unknown> = {};
    for (const xml of relatedXml) {
      for (const block of xmlBlocks(xml, 'dependency')) {
        const dependencyGroup = firstXmlTag(block, 'groupId');
        const dependencyArtifact = firstXmlTag(block, 'artifactId');
        if (dependencyGroup && dependencyArtifact) {
          dependencies[`${dependencyGroup}:${dependencyArtifact}`] = firstXmlTag(block, 'version') ?? '*';
        }
      }
      for (const block of xmlBlocks(firstXmlTag(xml, 'plugins') ?? '', 'plugin')) {
        const pluginGroup = firstXmlTag(block, 'groupId') ?? 'org.apache.maven.plugins';
        const pluginArtifact = firstXmlTag(block, 'artifactId');
        if (pluginArtifact) buildPlugins.add(`${pluginGroup}:${pluginArtifact}`);
      }
      const properties = firstXmlTag(xml, 'properties') ?? '';
      for (const match of properties.matchAll(/<([A-Za-z0-9_.-]+)(?:\s[^>]*)?>([^<]+)<\/\1>/g)) {
        extra[match[1]] = match[2].trim();
      }
    }
    return {
      ecosystem: 'maven',
      name: groupId && artifactId ? `${groupId}:${artifactId}` : artifactId,
      version,
      type: firstXmlTag(coordinatesXml, 'packaging') ?? 'jar',
      dependencies,
      peerDependencies: {},
      extra,
      buildPlugins: [...buildPlugins],
    };
  } catch {
    return undefined;
  }
}

function readGradleManifest(directory: string): RepositoryManifest | undefined {
  const buildPath = ['build.gradle.kts', 'build.gradle']
    .map((file) => resolve(directory, file))
    .find(existsSync);
  if (!buildPath) return undefined;
  try {
    const build = readFileSync(buildPath, 'utf8');
    const settingsPath = ['settings.gradle.kts', 'settings.gradle']
      .map((file) => resolve(directory, file))
      .find(existsSync);
    const settings = settingsPath ? readFileSync(settingsPath, 'utf8') : '';
    const propertiesPath = resolve(directory, 'gradle.properties');
    const properties = existsSync(propertiesPath)
      ? Object.fromEntries(readFileSync(propertiesPath, 'utf8').split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
        }))
      : {};
    const projectName = settings.match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const group = build.match(/(?:^|\n)\s*group\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? properties.group;
    const version = build.match(/(?:^|\n)\s*version\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? properties.version;
    const dependencies: Record<string, string> = {};
    for (const match of build.matchAll(/['"]([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([^'"]+)['"]/g)) {
      dependencies[`${match[1]}:${match[2]}`] = match[3];
    }
    const buildPlugins = [...build.matchAll(/id\s*(?:\(|\s)['"]([^'"]+)['"]/g)].map((match) => match[1]);
    return {
      ecosystem: 'gradle',
      name: projectName ? (group ? `${group}:${projectName}` : projectName) : undefined,
      version,
      type: 'project',
      dependencies,
      peerDependencies: {},
      extra: properties,
      buildPlugins,
    };
  } catch {
    return undefined;
  }
}

export function readRepositoryManifest(directory: string): RepositoryManifest {
  const packagePath = resolve(directory, 'package.json');
  if (existsSync(packagePath)) {
    const value = readJson(packagePath);
    if (value) {
      return {
        ecosystem: 'npm',
        name: typeof value.name === 'string' ? value.name : undefined,
        version: typeof value.version === 'string' ? value.version : undefined,
        type: typeof value.type === 'string' ? value.type : undefined,
        private: typeof value.private === 'boolean' ? value.private : undefined,
        dependencies: {
          ...stringRecord(value.dependencies),
          ...stringRecord(value.devDependencies),
          ...stringRecord(value.optionalDependencies),
        },
        peerDependencies: stringRecord(value.peerDependencies),
        extra: {},
        buildPlugins: [],
      };
    }
  }

  const composerPath = resolve(directory, 'composer.json');
  if (existsSync(composerPath)) {
    const value = readJson(composerPath);
    if (value) {
      return {
        ecosystem: 'composer',
        name: typeof value.name === 'string' ? value.name : undefined,
        version: typeof value.version === 'string' ? value.version : undefined,
        type: typeof value.type === 'string' ? value.type : undefined,
        dependencies: {
          ...stringRecord(value.require),
          ...stringRecord(value['require-dev']),
        },
        peerDependencies: {},
        extra: value.extra && typeof value.extra === 'object' && !Array.isArray(value.extra)
          ? value.extra as Record<string, unknown>
          : {},
        buildPlugins: [],
      };
    }
  }

  const maven = readMavenManifest(directory);
  if (maven) return maven;
  const gradle = readGradleManifest(directory);
  if (gradle) return gradle;

  return { ecosystem: 'unknown', dependencies: {}, peerDependencies: {}, extra: {}, buildPlugins: [] };
}

/** Extract every declared major from semver/composer constraints without pretending to resolve them. */
export function versionMajors(constraint?: string): string[] {
  if (!constraint) return [];
  return [...new Set([...constraint.matchAll(/(?<![\d.])(\d+)(?:\.\d+)*/g)].map((match) => match[1]))];
}

function dependencyMatches(
  manifest: RepositoryManifest,
  profile: TechnologyProfile,
): Array<{ name: string; constraint: string; peer: boolean }> {
  const exact = new Set([
    ...(profile.package_dependencies_any ?? []),
    ...(profile.composer_require_any ?? []),
    ...(profile.maven_dependencies_any ?? []),
  ]);
  const prefixes = profile.dependency_prefixes_any ?? [];
  const result: Array<{ name: string; constraint: string; peer: boolean }> = [];
  for (const [name, constraint] of Object.entries(manifest.dependencies)) {
    if (exact.has(name) || prefixes.some((prefix) => name.startsWith(prefix))) {
      result.push({ name, constraint, peer: false });
    }
  }
  for (const [name, constraint] of Object.entries(manifest.peerDependencies)) {
    if (exact.has(name) || prefixes.some((prefix) => name.startsWith(prefix))) {
      result.push({ name, constraint, peer: true });
    }
  }
  return result;
}

export function classifyRepositoryManifest(
  manifest: RepositoryManifest,
  profile: TechnologyProfile,
  context: { repositoryName?: string } = {},
): ManifestClassification {
  const evidence: string[] = [];
  const coreNames = new Set(profile.core_package_names_any ?? []);
  const repositoryName = context.repositoryName?.toLowerCase();
  const isCoreRepository = Boolean(repositoryName && profile.core_repository_names_any
    ?.some((name) => name.toLowerCase() === repositoryName));
  const isCore = Boolean((manifest.name && coreNames.has(manifest.name)) || isCoreRepository);
  if (manifest.name && coreNames.has(manifest.name)) evidence.push(`core-package:${manifest.name}`);
  if (isCoreRepository) evidence.push(`core-repository:${repositoryName}`);
  const isExplicitLibrary = Boolean(manifest.name && profile.library_package_names_any?.includes(manifest.name));
  if (isExplicitLibrary) evidence.push(`library-package:${manifest.name}`);

  const matches = dependencyMatches(manifest, profile)
    .filter((match) => match.name !== manifest.name);
  for (const match of matches) {
    evidence.push(`${match.peer ? 'peer' : 'dependency'}:${match.name}@${match.constraint}`);
  }
  const extraMatches = (profile.composer_extra_any ?? [])
    .filter((key) => Object.prototype.hasOwnProperty.call(manifest.extra, key));
  evidence.push(...extraMatches.map((key) => `composer-extra:${key}`));
  const mavenVersionProperties = Object.entries(manifest.extra)
    .filter(([key, value]) => typeof value === 'string' && (profile.maven_version_properties_any ?? [])
      .some((fragment) => key.toLowerCase().includes(fragment.toLowerCase()))) as Array<[string, string]>;
  evidence.push(...mavenVersionProperties.map(([key, value]) => `maven-property:${key}@${value}`));

  const libraryComposerTypes = new Set(['library', 'metapackage', 'composer-plugin', 'vcs']);
  const hasApplicationPlugin = manifest.buildPlugins.some((plugin) =>
    plugin === 'org.springframework.boot' || plugin.endsWith(':spring-boot-maven-plugin'));
  const libraryShape = isExplicitLibrary || (manifest.ecosystem === 'composer'
    ? libraryComposerTypes.has((manifest.type ?? '').toLowerCase()) || extraMatches.length > 0
    : manifest.ecosystem === 'npm'
      ? matches.some((match) => match.peer) || (Boolean(manifest.name) && manifest.private !== true && matches.length > 0)
      : (manifest.ecosystem === 'maven' || manifest.ecosystem === 'gradle')
        ? matches.length > 0 && !hasApplicationPlugin
        : false);
  const artifactKind: RepositoryArtifactKind = isCore
    ? 'core'
    : libraryShape
      ? 'library'
      : manifest.ecosystem === 'unknown'
        ? 'unknown'
        : 'application';

  if (libraryShape) evidence.push(`manifest-kind:${manifest.type ?? manifest.ecosystem}`);
  const constraints = [...new Set([
    ...matches.flatMap((match) => versionMajors(match.constraint)),
    ...mavenVersionProperties.flatMap(([, value]) => versionMajors(value)),
  ])].sort(
    (left, right) => Number(left) - Number(right),
  );
  const ownMajors = versionMajors(manifest.version);
  const technologyVersion = isCore
    ? ownMajors[0] ?? (constraints.length === 1 ? constraints[0] : undefined)
    : undefined;

  return {
    artifactKind,
    packageEcosystem: manifest.ecosystem,
    packageName: manifest.name,
    packageVersion: manifest.version,
    technologyVersion,
    technologyConstraints: constraints,
    evidence,
  };
}

export function packageKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
