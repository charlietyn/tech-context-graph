import { Injectable } from '@nestjs/common';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { StoredRepository } from '../models/repository-state';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { RepositoryFingerprintService } from './repository-fingerprint.service';
import { resolveGraphOutput } from './graph-output-path';
import { TechnologyGraphService } from './technology-graph.service';
import { GraphifyIgnoreService } from './graphify-ignore.service';

export interface GraphCommandResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

export interface InspectionProgress {
  stage: 'preparing' | 'scanning' | 'extracting' | 'writing' | 'complete';
  percent: number;
  message: string;
}

export interface InspectionNotice {
  impact: 'important' | 'minor';
  message: string;
}

export interface GraphifyInspectionResult {
  graphPath: string;
  nodeCount: number;
  edgeCount: number;
  communityCount?: number;
  durationMs: number;
  notices: InspectionNotice[];
  clustered: boolean;
  aggregateGraphPath?: string;
}

/**
 * Parses the terminal "wrote ...graph.json: N nodes, M edges, K communities" line
 * that Graphify prints on a successful extraction, so we can surface community counts
 * (which never reach graph.json's node/edge totals) in the results table.
 */
export function graphSummaryFromLine(line: string): { nodes: number; edges: number; communities: number } | undefined {
  // Anchor on "graph.json:" rather than the path — Windows paths contain a drive-letter
  // colon (C:\...) that a naive [^:]* would stop at.
  const match = line.match(/graph\.json:\s*([\d,]+)\s*nodes?,\s*([\d,]+)\s*edges?,\s*([\d,]+)\s*communit/i);
  if (!match) return undefined;
  const toNumber = (value: string): number => Number(value.replace(/,/g, ''));
  return { nodes: toNumber(match[1]), edges: toNumber(match[2]), communities: toNumber(match[3]) };
}

/**
 * Turns a raw process exit code into a human-readable diagnosis. Windows reports exit
 * codes as unsigned 32-bit DWORDs, so a Graphify crash surfaces here as 4294967295 (-1)
 * or an NTSTATUS such as 0xC0000005; both are meaningless to a user without translation.
 */
export function describeExitFailure(code: number | null, stderr: string): string {
  const detail = stderr.trim();
  const tail = detail ? ` ${detail}` : '';
  if (code === null) return `Graphify was terminated by a signal before it finished.${tail}`;
  const signed = code > 0x7fffffff ? code - 0x1_0000_0000 : code;
  const hints: Record<number, string> = {
    [-1]: 'generic internal failure',
    [-1073741819]: 'access violation / segmentation fault (0xC0000005)',
    [-1073741795]: 'illegal instruction (0xC000001D)',
    [-1073740791]: 'stack buffer overrun (0xC0000409)',
    [-1073741510]: 'terminated with Ctrl+C (0xC000013A)',
    [134]: 'aborted (SIGABRT)',
    [137]: 'killed — most likely out of memory (OOM)',
    [139]: 'segmentation fault (SIGSEGV)',
  };
  const hint = hints[signed];
  const label = signed < 0
    ? `code ${signed} (0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')})`
    : `code ${signed}`;
  return `Graphify crashed with ${label}${hint ? ` — ${hint}` : ''}.${tail}`;
}

export function graphifyProgressFromLine(line: string): InspectionProgress | undefined {
  const extraction = line.match(/AST extraction:\s*(\d+)\s*\/\s*(\d+)[^\r\n]*?\((\d+)%\)/i)
    ?? line.match(/AST extraction:\s*(\d+)\s*\/\s*(\d+)/i);
  if (extraction) {
    const completed = Number(extraction[1]);
    const total = Math.max(1, Number(extraction[2]));
    const percent = extraction[3] ? Number(extraction[3]) : Math.round((completed / total) * 100);
    return { stage: 'extracting', percent: Math.min(95, Math.max(10, percent)), message: `AST ${completed}/${total} files (${percent}%)` };
  }
  if (/scann|discover|collecting files/i.test(line)) return { stage: 'scanning', percent: 5, message: 'Scanning source files' };
  if (/wrote|writing|serializ/i.test(line) && /graph/i.test(line)) return { stage: 'writing', percent: 98, message: 'Writing graph.json' };
  return undefined;
}

function noticeFromLine(line: string): InspectionNotice | undefined {
  if (/not classified|--code-only:\s*skipping/i.test(line)) {
    return { impact: 'minor', message: line.trim() };
  }
  if (/warning|zero nodes|failed to parse|parse error/i.test(line)) {
    return {
      impact: /zero nodes|failed to parse|parse error/i.test(line) ? 'important' : 'minor',
      message: line.trim(),
    };
  }
  return undefined;
}

@Injectable()
export class GraphifyCliService {
  constructor(
    private readonly store: RepositoryStoreService,
    private readonly fingerprints: RepositoryFingerprintService,
    private readonly technologyGraphs?: TechnologyGraphService,
    private readonly ignores?: GraphifyIgnoreService,
  ) {}

  async inspect(workspaceRoot: string, repository: StoredRepository, options: {
    force?: boolean;
    noCluster?: boolean;
    onLine?: (line: string) => void;
    onProgress?: (progress: InspectionProgress) => void;
  } = {}): Promise<GraphifyInspectionResult> {
    if (!existsSync(repository.sourcePath)) throw new Error(`The source folder no longer exists: ${repository.sourcePath}`);
    const started = Date.now();
    const notices: InspectionNotice[] = [];
    const output = resolveGraphOutput(workspaceRoot, repository.graphOutput);
    mkdirSync(output, { recursive: true });
    const logPath = resolve(workspaceRoot, '.tcg', 'logs', `${repository.key}-${Date.now()}.log`);
    mkdirSync(dirname(logPath), { recursive: true });
    const args = ['extract', repository.sourcePath, '--code-only', '--out', output];
    const ignorePatterns = this.ignores?.patterns(repository.ignoreProfile) ?? [];
    for (const pattern of ignorePatterns) args.push('--exclude', pattern);
    if (ignorePatterns.length > 0) notices.push({
      impact: 'minor',
      message: `Applied ${ignorePatterns.length} managed ignore rule(s) from common and ${repository.ignoreProfile} profiles.`,
    });
    if (options.force) args.push('--force');
    const estimatedFiles = this.estimateTrackedFiles(repository.sourcePath);
    const skipClustering = options.noCluster === true || (estimatedFiles !== undefined && estimatedFiles >= 10_000);
    if (skipClustering) {
      args.push('--no-cluster');
      notices.push({
        impact: 'important',
        message: `Clustering was skipped to avoid exhausting memory (${estimatedFiles?.toLocaleString() ?? 'many'} tracked files). The structural graph is usable; community analysis can be generated later on a larger machine.`,
      });
    }
    const fingerprint = this.fingerprints.calculate(repository);
    const commandText = `graphify ${args.map(this.quote).join(' ')}`;
    const inspectionId = await this.store.beginInspection(workspaceRoot, repository, fingerprint, commandText, logPath);
    const log = createWriteStream(logPath, { flags: 'a' });
    let communityCount: number | undefined;
    try {
      options.onProgress?.({ stage: 'preparing', percent: 1, message: 'Preparing Graphify' });
      await this.spawnGraphify(args, (line) => {
        log.write(`${line}\n`);
        options.onLine?.(line);
        const progress = graphifyProgressFromLine(line);
        if (progress) options.onProgress?.(progress);
        const summary = graphSummaryFromLine(line);
        if (summary) communityCount = summary.communities;
        const notice = noticeFromLine(line);
        if (notice && !notices.some((item) => item.message === notice.message)) notices.push(notice);
      });
      options.onProgress?.({ stage: 'writing', percent: 98, message: 'Validating graph.json' });
      const graphPath = this.resolveGraphPath(output);
      if (!existsSync(graphPath)) {
        throw new Error(
          `Graphify finished without creating a graph.json under ${output}. `
          + `Checked ${resolve(output, 'graph.json')} and ${resolve(output, 'graphify-out', 'graph.json')}.`,
        );
      }
      let counts = this.graphCounts(graphPath);
      if (counts.danglingEdges > 0) {
        const removed = this.removeDanglingEdges(graphPath);
        notices.push({
          impact: 'important',
          message: `Removed ${removed} invalid edge(s) whose endpoints were excluded or missing; all remaining edges passed integrity validation.`,
        });
        counts = this.graphCounts(graphPath);
        if (counts.danglingEdges > 0) {
          throw new Error(`Graph integrity repair failed: ${counts.danglingEdges} dangling edge(s) remain in ${graphPath}.`);
        }
      }
      await this.store.completeInspection(workspaceRoot, inspectionId, {
        status: 'READY', graphJsonPath: graphPath, graphifyVersion: this.version(),
        nodeCount: counts.nodes, edgeCount: counts.edges,
      });
      let aggregateGraphPath: string | undefined;
      try {
        const aggregate = await this.technologyGraphs?.refresh(workspaceRoot, repository.technology);
        if (aggregate) {
          aggregateGraphPath = aggregate.graphPath;
          notices.push({
            impact: 'minor',
            message: `Refreshed ${repository.technologyLabel} aggregate graph from ${aggregate.members.length} repositories (${aggregate.nodeCount} nodes, ${aggregate.edgeCount} edges).`,
          });
        }
      } catch (error) {
        notices.push({
          impact: 'important',
          message: `The member graph is ready, but its technology aggregate could not be refreshed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      options.onProgress?.({ stage: 'complete', percent: 100, message: 'Graph validated' });
      return {
        graphPath,
        nodeCount: counts.nodes,
        edgeCount: counts.edges,
        communityCount,
        durationMs: Date.now() - started,
        notices,
        clustered: !skipClustering,
        aggregateGraphPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.write(`ERROR: ${message}\n`);
      await this.store.completeInspection(workspaceRoot, inspectionId, { status: 'FAILED', errorMessage: message });
      throw error;
    } finally {
      log.end();
    }
  }

  async query(workspaceRoot: string, repository: StoredRepository, action: 'query' | 'explain' | 'path', input: string, second?: string): Promise<GraphCommandResult> {
    const output = resolveGraphOutput(workspaceRoot, repository.graphOutput);
    const storedPath = repository.graphJsonPath && existsSync(repository.graphJsonPath)
      ? repository.graphJsonPath
      : undefined;
    const graphPath = storedPath ?? this.resolveGraphPath(output);
    if (!existsSync(graphPath)) throw new Error('This repository does not have an available graph.json. Run the inspection first.');
    const args = action === 'path'
      ? ['path', input, second ?? '', '--graph', graphPath]
      : [action, input, '--graph', graphPath];
    const started = Date.now();
    try {
      const result = await this.captureGraphify(args);
      await this.store.recordQuery(workspaceRoot, {
        repositoryId: repository.id, action, input: action === 'path' ? `${input} -> ${second}` : input,
        output: result.output, status: 'SUCCESS', durationMs: result.durationMs,
      });
      return result;
    } catch (error) {
      await this.store.recordQuery(workspaceRoot, {
        repositoryId: repository.id, action, input, status: 'FAILED', durationMs: Date.now() - started,
        output: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  version(): string {
    const result = spawnSync('graphify', ['--version'], { encoding: 'utf8', shell: false });
    return result.status === 0 ? result.stdout.trim() : 'unknown';
  }

  isAvailable(): boolean {
    return spawnSync('graphify', ['--version'], { encoding: 'utf8', shell: false }).status === 0;
  }

  graphCounts(graphPath: string): { nodes: number; edges: number; danglingEdges: number } {
    const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as any;
    const nodeItems = Array.isArray(graph.nodes) ? graph.nodes : Array.isArray(graph.elements?.nodes) ? graph.elements.nodes : [];
    const edgeItems = Array.isArray(graph.links) ? graph.links : Array.isArray(graph.edges) ? graph.edges : Array.isArray(graph.elements?.edges) ? graph.elements.edges : [];
    const ids = new Set(nodeItems.map((node: any) => String(node.id)));
    const endpoint = (edge: any, primary: string, fallback: string): string => {
      const value = edge[primary] ?? edge[fallback];
      return String(typeof value === 'object' && value !== null ? value.id : value);
    };
    const danglingEdges = edgeItems.filter((edge: any) =>
      !ids.has(endpoint(edge, 'source', 'from')) || !ids.has(endpoint(edge, 'target', 'to'))).length;
    return { nodes: nodeItems.length, edges: edgeItems.length, danglingEdges };
  }

  removeDanglingEdges(graphPath: string): number {
    const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as any;
    const nodeItems = Array.isArray(graph.nodes) ? graph.nodes : Array.isArray(graph.elements?.nodes) ? graph.elements.nodes : [];
    const ids = new Set(nodeItems.map((node: any) => String(node.id)));
    const endpoint = (edge: any, primary: string, fallback: string): string => {
      const value = edge[primary] ?? edge[fallback];
      return String(typeof value === 'object' && value !== null ? value.id : value);
    };
    const filter = (items: any[]): any[] => items.filter((edge: any) =>
      ids.has(endpoint(edge, 'source', 'from')) && ids.has(endpoint(edge, 'target', 'to')));
    let original = 0;
    let repaired: any[] = [];
    if (Array.isArray(graph.links)) {
      original = graph.links.length;
      repaired = filter(graph.links);
      graph.links = repaired;
    } else if (Array.isArray(graph.edges)) {
      original = graph.edges.length;
      repaired = filter(graph.edges);
      graph.edges = repaired;
    } else if (Array.isArray(graph.elements?.edges)) {
      original = graph.elements.edges.length;
      repaired = filter(graph.elements.edges);
      graph.elements.edges = repaired;
    }
    const removed = original - repaired.length;
    if (removed > 0) {
      const temporary = `${graphPath}.repairing`;
      writeFileSync(temporary, JSON.stringify(graph), 'utf8');
      renameSync(temporary, graphPath);
    }
    return removed;
  }

  resolveGraphPath(output: string): string {
    const direct = resolve(output, 'graph.json');
    if (existsSync(direct)) return direct;
    return resolve(output, 'graphify-out', 'graph.json');
  }

  private async spawnGraphify(args: string[], onLine: (line: string) => void): Promise<void> {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn('graphify', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      let settled = false;
      const cleanup = () => {
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
      };
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const interrupt = () => {
        this.terminateProcessTree(child.pid);
        finish(() => reject(new Error('Graphify inspection was cancelled; child processes were terminated.')));
      };
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      const wire = (chunk: Buffer, isError: boolean) => {
        const text = chunk.toString();
        if (isError) stderr += text;
        for (const line of text.split(/\r?\n/).filter(Boolean)) onLine(line);
      };
      child.stdout.on('data', (chunk: Buffer) => wire(chunk, false));
      child.stderr.on('data', (chunk: Buffer) => wire(chunk, true));
      child.on('error', (error) => finish(() => reject(error)));
      child.on('close', (code) => finish(() => code === 0
        ? resolvePromise()
        : reject(new Error(describeExitFailure(code, stderr)))));
    });
  }

  private terminateProcessTree(pid: number | undefined): void {
    if (!pid) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: false, stdio: 'ignore' });
      return;
    }
    try { process.kill(pid, 'SIGTERM'); } catch { /* The process already exited. */ }
  }

  private async captureGraphify(args: string[]): Promise<GraphCommandResult> {
    const started = Date.now();
    return await new Promise<GraphCommandResult>((resolvePromise, reject) => {
      const child = spawn('graphify', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => code === 0
        ? resolvePromise({ output: stdout.trim(), exitCode: 0, durationMs: Date.now() - started })
        : reject(new Error(describeExitFailure(code, stderr))));
    });
  }

  private quote(value: string): string {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }

  private estimateTrackedFiles(repositoryPath: string): number | undefined {
    const result = spawnSync('rg', ['--files', repositoryPath], {
      encoding: 'utf8',
      shell: false,
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0 && !result.stdout) return undefined;
    return result.stdout.split(/\r?\n/).filter(Boolean).length;
  }
}
