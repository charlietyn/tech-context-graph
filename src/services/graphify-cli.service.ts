import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { runProcess, OperationError } from './process-runner';
import { acquireLock } from './operation-lock';
import { scopedGitEnvironment } from './git-access';
import { createWriteStream, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
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
  unchanged?: boolean;
  logPath?: string;
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

  private versionCache?: { path: string; checkedAt: number; promise: Promise<string> };
  private helpCache?: Promise<string>;
  cachedVersion = 'checking';

  async inspect(workspaceRoot: string, repository: StoredRepository, options: {
    force?: boolean; noCluster?: boolean; signal?: AbortSignal; deferAggregate?: boolean;
    onLine?: (line: string) => void; onProgress?: (progress: InspectionProgress) => void;
  } = {}): Promise<GraphifyInspectionResult> {
    const output = resolveGraphOutput(workspaceRoot, repository.graphOutput);
    const release = await acquireLock(resolve(output, '.tcg-inspection.lock'));
    try { return await this.inspectLocked(workspaceRoot, repository, output, options); }
    finally { await release(); }
  }

  private async inspectLocked(workspaceRoot: string, repository: StoredRepository, output: string, options: {
    force?: boolean; noCluster?: boolean; signal?: AbortSignal; deferAggregate?: boolean;
    onLine?: (line: string) => void; onProgress?: (progress: InspectionProgress) => void;
  }): Promise<GraphifyInspectionResult> {
    if (!existsSync(repository.sourcePath)) throw new Error(`Source folder missing: ${repository.sourcePath}`);
    const started = Date.now();
    const version = await this.version();
    if (version === 'unknown') throw new Error('Graphify is unavailable.');
    const ignores = this.ignores?.patterns(repository.ignoreProfile) ?? [];
    const configuration = createHash('sha256').update(JSON.stringify({
      schema: 2, source: resolve(repository.sourcePath), ignores, version, noCluster: options.noCluster ?? 'auto-10000', codeOnly: true,
    })).digest('hex');
    const fingerprint = await this.fingerprints.calculate(repository, options.signal);
    const pointer = resolve(output, 'tcg-current.json');
    const previous = this.readPublication(output);
    const priorGraph = this.publishedGraph(output, previous);
    let previousValid = false;
    if (priorGraph && existsSync(priorGraph)) {
      try {
        previousValid = createHash('sha256').update(await readFile(priorGraph)).digest('hex') === previous.graphDigest
          && this.graphCounts(priorGraph).danglingEdges === 0;
      } catch { /* A corrupt generation must not seed the next incremental extraction. */ }
    }
    if (!options.force && previous?.configuration === configuration && previous.fingerprint === fingerprint) {
      const graphPath = this.publishedGraph(output, previous);
      if (graphPath && previousValid) {
        const counts = this.graphCounts(graphPath);
        if (counts.danglingEdges === 0) {
          if (repository.inspectionStatus !== 'READY') {
            const verificationLog = resolve(workspaceRoot, '.tcg', 'logs', `verification-${randomUUID()}.log`);
            await mkdir(dirname(verificationLog), { recursive: true });
            await writeFile(verificationLog, `Verified existing publication ${graphPath}\nSource fingerprint: ${fingerprint}\n`);
            const inspectionId = await this.store.beginInspection(workspaceRoot, repository, fingerprint, 'tcg verified existing publication', verificationLog);
            const updated = { ...previous, inspectionId };
            const temp = `${pointer}.${randomUUID()}.tmp`;
            await writeFile(temp, JSON.stringify(updated, null, 2)); await rename(temp, pointer);
            await this.store.completeInspection(workspaceRoot, inspectionId, { status: 'READY', graphJsonPath: graphPath, graphifyVersion: version, nodeCount: counts.nodes, edgeCount: counts.edges });
          }
          return {
            graphPath, nodeCount: counts.nodes, edgeCount: counts.edges, communityCount: previous.communityCount,
            durationMs: Date.now() - started, notices: [], clustered: previous.clustered, unchanged: true,
          };
        }
      }
    }
    const runId = randomUUID();
    const generation = resolve(output, '.generations', runId);
    await mkdir(generation, { recursive: true });
    const logPath = resolve(workspaceRoot, '.tcg', 'logs', `inspection-${runId}.log`);
    await mkdir(dirname(logPath), { recursive: true });
    const notices: InspectionNotice[] = [];
    const help = await (this.helpCache ??= runProcess('graphify', ['--help'], { timeoutMs: 15_000 }).then((r) => r.stdout));
    // Installed extract supports incremental manifests with --out; retain its whole generation.
    const incremental = /incremental/i.test(help) && /--out/.test(help);
    if (incremental && !options.force && previousValid && previous?.configuration === configuration) {
      if (priorGraph && existsSync(priorGraph)) {
        await cp(dirname(dirname(priorGraph)), generation, { recursive: true });
      }
    }
    const estimatedFiles = options.noCluster ? undefined : await this.estimateTrackedFiles(repository.sourcePath, options.signal);
    const skipClustering = options.noCluster === true || (estimatedFiles !== undefined && estimatedFiles >= 10_000);
    const args = ['extract', repository.sourcePath, '--code-only', '--out', generation];
    for (const pattern of ignores) args.push('--exclude', pattern);
    if (options.force || !incremental) args.push('--force');
    if (skipClustering) args.push('--no-cluster');
    const inspectionId = await this.store.beginInspection(workspaceRoot, repository, fingerprint, `graphify ${args.map(this.quote).join(' ')}`, logPath);
    const log = createWriteStream(logPath, { flags: 'a' });
    let logError: Error | undefined;
    log.on('error', (error) => { logError = error; });
    let communityCount: number | undefined;
    try {
      options.onProgress?.({ stage: 'preparing', percent: 1, message: 'Preparing Graphify' });
      await this.spawnGraphify(args, (line) => {
        log.write(`${line}\n`); options.onLine?.(line);
        const progress = graphifyProgressFromLine(line); if (progress) options.onProgress?.(progress);
        const summary = graphSummaryFromLine(line); if (summary) communityCount = summary.communities;
        const notice = noticeFromLine(line); if (notice && !notices.some((n) => n.message === notice.message)) notices.push(notice);
      }, options.signal);
      if (logError) throw logError;
      options.onProgress?.({ stage: 'writing', percent: 98, message: 'Validating new graph' });
      const graphPath = this.resolveGraphPath(generation);
      let counts = this.graphCounts(graphPath);
      if (counts.danglingEdges) {
        const removed = this.removeDanglingEdges(graphPath);
        notices.push({ impact: 'important', message: `Removed ${removed} dangling edges before publication.` });
        counts = this.graphCounts(graphPath);
      }
      if (counts.danglingEdges) throw new Error('Graph integrity validation failed.');
      if (await this.fingerprints.calculate(repository, options.signal) !== fingerprint) {
        throw new OperationError('SOURCE_CHANGED', 'Source changed during extraction; the previous graph was preserved.');
      }
      if (options.signal?.aborted) throw new OperationError('CANCELLED', 'Inspection cancelled before publication.');
      const publication = {
        schema: 2, inspectionId, fingerprint, configuration, graphifyVersion: version,
        graph: relative(output, graphPath), graphDigest: createHash('sha256').update(await readFile(graphPath)).digest('hex'),
        clustered: !skipClustering, communityCount, publishedAt: new Date().toISOString(),
      };
      const temporary = `${pointer}.${runId}.tmp`;
      await writeFile(temporary, JSON.stringify(publication, null, 2));
      await rename(temporary, pointer);
      await this.store.completeInspection(workspaceRoot, inspectionId, {
        status: 'READY', graphJsonPath: graphPath, graphifyVersion: version, nodeCount: counts.nodes, edgeCount: counts.edges,
      });
      let aggregateGraphPath: string | undefined;
      if (!options.deferAggregate) {
        try { aggregateGraphPath = (await this.technologyGraphs?.refresh(workspaceRoot, repository.technology))?.graphPath; }
        catch (error) { notices.push({ impact: 'important', message: `Aggregate failed: ${error instanceof Error ? error.message : String(error)}` }); }
      }
      options.onProgress?.({ stage: 'complete', percent: 100, message: 'Graph published' });
      return { graphPath, nodeCount: counts.nodes, edgeCount: counts.edges, communityCount, durationMs: Date.now() - started,
        notices, clustered: !skipClustering, aggregateGraphPath, logPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.write(`ERROR: ${message}\n`);
      await this.store.completeInspection(workspaceRoot, inspectionId, { status: 'FAILED', errorMessage: message });
      throw error;
    } finally { await new Promise<void>((done) => log.end(done)); }
  }

  readPublication(output: string): any | undefined {
    try { return JSON.parse(readFileSync(resolve(output, 'tcg-current.json'), 'utf8')); } catch { return undefined; }
  }

  private publishedGraph(output: string, publication: any): string | undefined {
    if (typeof publication?.graph !== 'string' || isAbsolute(publication.graph)) return undefined;
    const path = resolve(output, publication.graph);
    const rel = relative(resolve(output, '.generations'), path);
    return rel && !rel.startsWith('..') && !isAbsolute(rel) ? path : undefined;
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

  async version(): Promise<string> {
    const path = process.env.PATH ?? '';
    if (!this.versionCache || this.versionCache.path !== path || Date.now() - this.versionCache.checkedAt > 60_000) {
      this.helpCache = undefined;
      this.versionCache = { path, checkedAt: Date.now(), promise: runProcess('graphify', ['--version'], { timeoutMs: 10_000 })
        .then((r) => r.exitCode === 0 ? r.stdout.trim() : 'unknown').catch(() => 'unknown')
        .then((value) => { this.cachedVersion = value; return value; }) };
    }
    return this.versionCache.promise;
  }

  invalidateVersion(): void { this.versionCache = undefined; this.helpCache = undefined; this.cachedVersion = 'checking'; }
  async isAvailable(): Promise<boolean> { return await this.version() !== 'unknown'; }

  graphCounts(graphPath: string): { nodes: number; edges: number; danglingEdges: number } {
    const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as any;
    if (!Array.isArray(graph.nodes) && !Array.isArray(graph.elements?.nodes)) throw new Error('Invalid graph: nodes must be an array.');
    if (!Array.isArray(graph.links) && !Array.isArray(graph.edges) && !Array.isArray(graph.elements?.edges)) throw new Error('Invalid graph: edges must be an array.');
    const nodeItems = Array.isArray(graph.nodes) ? graph.nodes : Array.isArray(graph.elements?.nodes) ? graph.elements.nodes : [];
    const edgeItems = Array.isArray(graph.links) ? graph.links : Array.isArray(graph.edges) ? graph.edges : Array.isArray(graph.elements?.edges) ? graph.elements.edges : [];
    const ids = new Set(nodeItems.map((node: any) => String(node.id)));
    if (ids.size !== nodeItems.length || nodeItems.some((node: any) => node.id === undefined || node.id === null)) throw new Error('Invalid graph node IDs.');
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
    const published = this.publishedGraph(output, this.readPublication(output));
    if (published && existsSync(published)) return published;
    const direct = resolve(output, 'graph.json');
    if (existsSync(direct)) return direct;
    return resolve(output, 'graphify-out', 'graph.json');
  }

  private async spawnGraphify(args: string[], onLine: (line: string) => void, signal?: AbortSignal): Promise<void> {
    const result = await runProcess('graphify', args, { onLine, signal, timeoutMs: 30 * 60_000, env: scopedGitEnvironment(args[1]) });
    if (result.exitCode !== 0) throw new Error(describeExitFailure(result.exitCode, result.stderr));
  }

  private async captureGraphify(args: string[]): Promise<GraphCommandResult> {
    const result = await runProcess('graphify', args, { timeoutMs: 120_000 });
    if (result.exitCode !== 0) throw new Error(describeExitFailure(result.exitCode, result.stderr));
    return { output: result.stdout.trim(), exitCode: 0, durationMs: result.durationMs };
  }

  private quote(value: string): string {
    return /\s/.test(value) ? JSON.stringify(value) : value;
  }

  private async estimateTrackedFiles(repositoryPath: string, signal?: AbortSignal): Promise<number | undefined> {
    try {
      const result = await runProcess('rg', ['--files', repositoryPath], { timeoutMs: 30_000, signal });
      return result.exitCode === 0 ? result.stdout.split(/\r?\n/).filter(Boolean).length : undefined;
    } catch (error) { if (signal?.aborted) throw error; return undefined; }
  }
}
