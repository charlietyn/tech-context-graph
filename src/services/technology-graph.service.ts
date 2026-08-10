import { Injectable } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
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

  async refresh(workspaceRoot: string, technology: string): Promise<TechnologyAggregateResult | undefined> {
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
    if (members.length === 1) {
      graphPath = members[0].graphJsonPath!;
    } else {
      const args = ['merge-graphs', ...members.map((item) => item.graphJsonPath!), '--out', graphPath];
      const result = spawnSync('graphify', args, { encoding: 'utf8', shell: false, maxBuffer: 32 * 1024 * 1024 });
      if (result.status !== 0 || !existsSync(graphPath)) {
        throw new Error(`Could not build the ${technology} aggregate graph. ${result.stderr?.trim() || result.stdout?.trim()}`);
      }
    }
    const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as any;
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
    const aggregate: TechnologyAggregateResult = {
      technology,
      graphPath,
      members: members.map((item) => item.key),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
    writeFileSync(resolve(outputRoot, 'aggregate.json'), JSON.stringify({
      schemaVersion: '2.0',
      ...aggregate,
      graphPath: relative(outputRoot, graphPath).replace(/\\/g, '/'),
      generatedAt: new Date().toISOString(),
    }, null, 2) + '\n', 'utf8');
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
