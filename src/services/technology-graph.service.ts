import { Injectable } from '@nestjs/common';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

@Injectable()
export class TechnologyGraphService {
  constructor(private readonly store: RepositoryStoreService) {}

  async organize(workspaceRoot: string, technology: string): Promise<number> {
    if (!technology || technology === 'unknown') return 0;
    const members = (await this.store.list(workspaceRoot)).filter((item) => item.technology === technology);
    if (members.length < 2) return 0;
    let relocated = 0;
    for (const member of members) {
      const graphOutput = technologyMemberGraphOutput(technology, member.key);
      if (member.graphOutput === graphOutput) continue;
      const source = resolveGraphOutput(workspaceRoot, member.graphOutput);
      const destination = resolveGraphOutput(workspaceRoot, graphOutput);
      const managedRoot = resolve(workspaceRoot, 'tech-graphify-out', 'technologies');
      if (!source.startsWith(managedRoot) || !destination.startsWith(managedRoot)) {
        throw new Error(`Refusing to relocate a graph outside the managed technology output: ${member.key}`);
      }
      if (existsSync(source) && existsSync(destination)) {
        throw new Error(`Cannot group ${member.key}: both source and destination graph folders exist.`);
      }
      if (existsSync(source)) {
        mkdirSync(dirname(destination), { recursive: true });
        renameSync(source, destination);
      }
      await this.store.relocateGraphOutput(workspaceRoot, member.id, {
        graphOutput,
        oldAbsolutePath: source,
        newAbsolutePath: destination,
      });
      relocated += 1;
    }
    return relocated;
  }

  async refresh(workspaceRoot: string, technology: string): Promise<TechnologyAggregateResult | undefined> {
    if (!technology || technology === 'unknown') return undefined;
    await this.organize(workspaceRoot, technology);
    const members = (await this.store.list(workspaceRoot)).filter((item) =>
      item.technology === technology
      && item.inspectionStatus === 'READY'
      && item.graphJsonPath
      && existsSync(item.graphJsonPath));
    if (members.length < 2) return undefined;
    const outputRoot = resolveGraphOutput(workspaceRoot, technologyGraphOutput(technology));
    const graphPath = resolve(outputRoot, 'graph.json');
    mkdirSync(outputRoot, { recursive: true });
    const args = ['merge-graphs', ...members.map((item) => item.graphJsonPath!), '--out', graphPath];
    const result = spawnSync('graphify', args, { encoding: 'utf8', shell: false, maxBuffer: 32 * 1024 * 1024 });
    if (result.status !== 0 || !existsSync(graphPath)) {
      throw new Error(`Could not build the ${technology} aggregate graph. ${result.stderr?.trim() || result.stdout?.trim()}`);
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
      ...aggregate,
      generatedAt: new Date().toISOString(),
    }, null, 2) + '\n', 'utf8');
    return aggregate;
  }
}
