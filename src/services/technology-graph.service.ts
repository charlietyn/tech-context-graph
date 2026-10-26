import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { runProcess } from './process-runner';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { StoredRepository } from '../models/repository-state';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import {
  resolveGraphOutput,
  technologyGraphOutput,
  technologyMemberGraphOutput,
} from './graph-output-path';

export interface TechnologyAggregateResult {
  technology: string;
  graphPath: string;
  members: string[];
  nodeCount: number;
  edgeCount: number;
  unchanged?: boolean;
}

export interface TechnologyManifest {
  schemaVersion: '2.0';
  id: string;
  coreStatus: 'present' | 'missing';
  generatedAt: string;
  members: Array<{
    key: string;
    kind: StoredRepository['artifactKind'];
    packageEcosystem: StoredRepository['packageEcosystem'];
    packageName?: string;
    packageVersion?: string;
    technologyVersion?: string;
    technologyConstraints: string[];
    inspectionStatus: string;
    graphPath: string;
  }>;
}

@Injectable()
export class TechnologyGraphService {
  constructor(private readonly store: RepositoryStoreService) {}

  async organize(workspaceRoot: string, technology: string): Promise<number> {
    if (!technology || technology === 'unknown') return 0;
    const members = (await this.store.list(workspaceRoot)).filter((item) => item.technology === technology);
    if (members.length === 0) return 0;
    let relocated = 0;
    for (const member of members) {
      const graphOutput = technologyMemberGraphOutput(technology, member.key);
      const source = resolveGraphOutput(workspaceRoot, member.graphOutput);
      const destination = resolveGraphOutput(workspaceRoot, graphOutput);
      const managedRoot = resolve(workspaceRoot, 'tech-graphify-out', 'technologies');
      if (member.graphOutput === graphOutput) {
        const legacySource = this.legacyVersionedCoreSource(workspaceRoot, technology, member);
        if (legacySource && !existsSync(destination)) {
          this.relocateDirectory(legacySource, destination, managedRoot, member.key, members.map((item) => item.key));
          await this.store.relocateGraphOutput(workspaceRoot, member.id, {
            graphOutput,
            oldAbsolutePath: legacySource,
            newAbsolutePath: destination,
          });
          relocated += 1;
        }
        continue;
      }
      if (!this.isWithin(managedRoot, source) || !this.isWithin(managedRoot, destination)) {
        throw new Error(`Refusing to relocate a graph outside the managed technology output: ${member.key}`);
      }
      if (existsSync(source) && existsSync(destination)) {
        throw new Error(`Cannot group ${member.key}: both source and destination graph folders exist.`);
      }
      if (existsSync(source)) {
        this.relocateDirectory(source, destination, managedRoot, member.key, members.map((item) => item.key));
      }
      await this.store.relocateGraphOutput(workspaceRoot, member.id, {
        graphOutput,
        oldAbsolutePath: source,
        newAbsolutePath: destination,
      });
      relocated += 1;
    }
    const updatedMembers = (await this.store.list(workspaceRoot)).filter((item) => item.technology === technology);
    this.writeTechnologyManifest(workspaceRoot, technology, updatedMembers);
    return relocated;
  }

  private legacyVersionedCoreSource(
    workspaceRoot: string,
    technology: string,
    member: StoredRepository,
  ): string | undefined {
    if (member.artifactKind !== 'core' || !member.technologyVersion) return undefined;
    const candidate = resolveGraphOutput(
      workspaceRoot,
      `./tech-graphify-out/technologies/${technology}-${member.technologyVersion}`,
    );
    return existsSync(candidate) ? candidate : undefined;
  }

  async refresh(workspaceRoot: string, technology: string, signal?: AbortSignal): Promise<TechnologyAggregateResult | undefined> {
    if (!technology || technology === 'unknown') return undefined;
    await this.organize(workspaceRoot, technology);
    const members = (await this.store.list(workspaceRoot)).filter((item) =>
      item.technology === technology
      && item.inspectionStatus === 'READY'
      && item.graphJsonPath
      && existsSync(item.graphJsonPath));
    if (members.length < 1) return undefined;
    const outputRoot = resolveGraphOutput(workspaceRoot, technologyGraphOutput(technology));
    let graphPath = resolve(outputRoot, 'graph.json');
    mkdirSync(outputRoot, { recursive: true });
    const signature = createHash('sha256');
    for (const member of members) signature.update(member.key).update(member.graphJsonPath!).update(readFileSync(member.graphJsonPath!));
    const inputSignature = signature.digest('hex');
    const metadataPath = resolve(outputRoot, 'aggregate.json');
    try {
      const previous = JSON.parse(readFileSync(metadataPath, 'utf8'));
      const previousPath = resolve(outputRoot, previous.graphPath);
      if (previous.inputSignature === inputSignature && existsSync(previousPath)
        && previous.graphDigest === createHash('sha256').update(readFileSync(previousPath)).digest('hex')) {
        return { ...previous, graphPath: previousPath, unchanged: true };
      }
    } catch { /* Missing or invalid aggregate: retry without re-extracting members. */ }
    const temporary = resolve(outputRoot, `.aggregate-${randomUUID()}.json`);
    if (members.length === 1) {
      graphPath = members[0].graphJsonPath!;
    } else {
      const args = ['merge-graphs', ...members.map((item) => item.graphJsonPath!), '--out', temporary];
      const result = await runProcess('graphify', args, { timeoutMs: 30 * 60_000, signal });
      if (result.exitCode !== 0 || !existsSync(temporary)) {
        throw new Error(`Could not build the ${technology} aggregate graph. ${result.stderr?.trim() || result.stdout?.trim()}`);
      }
    }
    const graph = JSON.parse(readFileSync(members.length > 1 ? temporary : graphPath, 'utf8')) as any;
    if (!Array.isArray(graph.nodes) || (!Array.isArray(graph.links) && !Array.isArray(graph.edges))) throw new Error('Invalid aggregate graph shape.');
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.links) ? graph.links : Array.isArray(graph.edges) ? graph.edges : [];
    const ids = new Set(nodes.map((node: any) => String(node.id)));
    const endpoint = (edge: any, primary: string, fallback: string): string => {
      const value = edge[primary] ?? edge[fallback];
      return String(typeof value === 'object' && value !== null ? value.id : value);
    };
    const dangling = edges.filter((edge: any) =>
      !ids.has(endpoint(edge, 'source', 'from')) || !ids.has(endpoint(edge, 'target', 'to'))).length;
    if (dangling > 0) throw new Error(`${technology} aggregate graph has ${dangling} dangling edge(s).`);
    if (signal?.aborted) throw new Error('Aggregate cancelled before publication.');
    if (members.length > 1) renameSync(temporary, graphPath);
    const aggregate: TechnologyAggregateResult = {
      technology,
      graphPath,
      members: members.map((item) => item.key),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
    const metadataTemporary = `${metadataPath}.${randomUUID()}.tmp`;
    writeFileSync(metadataTemporary, JSON.stringify({
      schemaVersion: '2.0',
      ...aggregate,
      graphPath: relative(outputRoot, graphPath).replace(/\\/g, '/'),
      generatedAt: new Date().toISOString(),
      inputSignature,
      graphDigest: createHash('sha256').update(readFileSync(graphPath)).digest('hex'),
    }, null, 2) + '\n', 'utf8');
    renameSync(metadataTemporary, metadataPath);
    return aggregate;
  }

  private isWithin(root: string, target: string): boolean {
    const value = relative(root, target);
    return value.length > 0 && value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
  }

  private relocateDirectory(
    source: string,
    destination: string,
    managedRoot: string,
    repositoryKey: string,
    memberKeys: string[],
  ): void {
    mkdirSync(dirname(destination), { recursive: true });
    const destinationInsideSource = this.isWithin(source, destination);
    if (!destinationInsideSource) {
      renameSync(source, destination);
      return;
    }

    const nestedMembers = readdirSync(source, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && memberKeys.includes(entry.name) && entry.name !== repositoryKey)
      .map((entry) => entry.name);
    if (nestedMembers.length > 0) {
      throw new Error(
        `Cannot safely relocate ${repositoryKey}: its legacy graph folder already contains member folders (${nestedMembers.join(', ')}).`,
      );
    }

    const temporary = resolve(managedRoot, `.tcg-relocate-${repositoryKey}-${Date.now()}`);
    if (existsSync(temporary)) throw new Error(`Temporary relocation path already exists: ${temporary}`);
    renameSync(source, temporary);
    try {
      mkdirSync(dirname(destination), { recursive: true });
      renameSync(temporary, destination);
    } catch (error) {
      if (existsSync(temporary) && !existsSync(source)) renameSync(temporary, source);
      throw error;
    }
  }

  private writeTechnologyManifest(
    workspaceRoot: string,
    technology: string,
    members: StoredRepository[],
  ): string {
    const outputRoot = resolveGraphOutput(workspaceRoot, technologyGraphOutput(technology));
    mkdirSync(outputRoot, { recursive: true });
    const graphPath = (member: StoredRepository): string => {
      const output = resolveGraphOutput(workspaceRoot, member.graphOutput);
      const direct = resolve(output, 'graph.json');
      const nested = resolve(output, 'graphify-out', 'graph.json');
      const absolute = member.graphJsonPath && existsSync(member.graphJsonPath)
        ? member.graphJsonPath
        : existsSync(direct)
          ? direct
          : nested;
      return relative(outputRoot, absolute).replace(/\\/g, '/');
    };
    const manifest: TechnologyManifest = {
      schemaVersion: '2.0',
      id: technology,
      coreStatus: members.some((member) => member.artifactKind === 'core') ? 'present' : 'missing',
      generatedAt: new Date().toISOString(),
      members: members.map((member) => ({
        key: member.key,
        kind: member.artifactKind,
        packageEcosystem: member.packageEcosystem,
        packageName: member.packageName,
        packageVersion: member.packageVersion,
        technologyVersion: member.technologyVersion,
        technologyConstraints: member.technologyConstraints,
        inspectionStatus: member.inspectionStatus,
        graphPath: graphPath(member),
      })),
    };
    const destination = resolve(outputRoot, 'technology.json');
    writeFileSync(destination, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return destination;
  }
}
