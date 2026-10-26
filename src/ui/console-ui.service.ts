import { Injectable } from '@nestjs/common';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { StoredRepository } from '../models/repository-state';
import { RepositoryStoreService } from '../persistence/repository-store.service';
import { CatalogReviewService } from '../services/catalog-review.service';
import { WorkspaceConfigService } from '../services/config.service';
import { GraphifyCliService } from '../services/graphify-cli.service';
import { InspectionReconcileService } from '../services/inspection-reconcile.service';
import { PathSelectionService } from '../services/path-selection.service';
import { RepositoryControlService } from '../services/repository-control.service';
import { RepositoryUpdateService, UpdateReport } from '../services/repository-update.service';
import { RepositoryRootService } from '../services/repository-root.service';
import { GlobalWorkspaceRegistryService } from '../services/global-workspace-registry.service';
import { ClackPromptService } from './clack-prompt.service';
import { RepositoryUiPresenterService } from './repository-ui-presenter.service';

export type ConsoleUiResult = 'SWITCH_WORKSPACE' | 'EXIT';

@Injectable()
export class ConsoleUiService {
  private backgroundNotice?: string;
  constructor(
    private readonly prompts: ClackPromptService,
    private readonly repositories: RepositoryControlService,
    private readonly store: RepositoryStoreService,
    private readonly graphify: GraphifyCliService,
    private readonly updates: RepositoryUpdateService,
    private readonly roots: RepositoryRootService,
    private readonly review: CatalogReviewService,
    private readonly pathSelection: PathSelectionService,
    private readonly config: WorkspaceConfigService,
    private readonly registry: GlobalWorkspaceRegistryService,
    private readonly presenter: RepositoryUiPresenterService,
    private readonly reconciler: InspectionReconcileService,
  ) {}

  async run(workspaceRootInput: string): Promise<ConsoleUiResult> {
    const root = resolve(workspaceRootInput);
    const clack = await this.prompts.load();
    const marker = this.registry.listValid().find((workspace) => resolve(workspace.path).toLowerCase() === root.toLowerCase());
    clack.intro('Tech Context Graph · Repository Knowledge Control');
    let background = new AbortController();
    let reconciled = false;
    let startupRecorded = false;
    let backgroundTask: Promise<void> | undefined;
    const openedAt = Date.now();
    try {
      let running = true;
      while (running) {
        await this.showWorkspaceSummary(root, marker?.name ?? this.config.load(root).workspace?.name ?? 'Workspace');
        if (!backgroundTask) {
          if (!startupRecorded) {
            mkdirSync(resolve(root, '.tcg', 'logs'), { recursive: true });
            appendFileSync(resolve(root, '.tcg', 'logs', 'startup.jsonl'), JSON.stringify({
              at: new Date().toISOString(), pid: process.pid, menuMs: Date.now() - openedAt, processMs: Math.round(process.uptime() * 1000),
            }) + '\n');
            startupRecorded = true;
          }
          backgroundTask = (reconciled ? Promise.resolve() : this.reconciler.reconcile(root))
            .then(() => this.repositories.refreshInBackground(root, background.signal))
            .catch((error) => { this.backgroundNotice = String(error); });
          reconciled = true;
          void this.graphify.version();
        }
        const action = await this.prompts.requireValue(await clack.select({
          message: 'What would you like to do?',
          options: [
            { value: 'discover', label: '1. Discover repositories', hint: 'Scan one or more explicitly configured search folders.' },
            { value: 'review', label: '2. Review detected repositories', hint: 'Accept only the repositories you want to manage.' },
            { value: 'inspect', label: '3. Inspect with Graphify', hint: 'Search and select one or several accepted repositories.' },
            { value: 'pull-inspect', label: '4. Pull latest code + update graphs', hint: 'Update all accepted repositories or choose one or more.' },
            { value: 'projects', label: '5. Project details and source folders', hint: 'Edit source folders, inspect or query repositories.' },
            { value: 'roots', label: '6. Repository search folders', hint: 'Add, scan, enable, disable or remove roots.' },
            { value: 'status', label: '7. Overall status' },
            { value: 'settings', label: '8. Workspace settings and file locations' },
            { value: 'switch', label: 'Switch workspace' },
            { value: 'exit', label: 'Exit' },
          ],
        }), 'Session ended.');
        background.abort(); await backgroundTask; backgroundTask = undefined; background = new AbortController();
        switch (action) {
          case 'discover': await this.discoverFlow(root); break;
          case 'review': await this.reviewCandidatesFlow(root); break;
          case 'inspect': await this.inspectFlow(root); this.repositories.invalidate(root); break;
          case 'pull-inspect': await this.inspectFlow(root, true); this.repositories.invalidate(root); break;
          case 'projects': await this.projectDetailFlow(root); break;
          case 'roots': await this.rootsFlow(root); break;
          case 'status': await this.statusFlow(root); break;
          case 'settings': await this.settingsFlow(root); break;
          case 'switch': return 'SWITCH_WORKSPACE';
          case 'exit': running = false; break;
        }
      }
      clack.outro('Tech Context Graph closed successfully.');
      return 'EXIT';
    } catch (error) {
      if (error instanceof Error && error.message === 'TCG_CANCELLED') return 'EXIT';
      throw error;
    } finally { background.abort(); await backgroundTask; }
  }

  private async showWorkspaceSummary(root: string, name: string): Promise<void> {
    const clack = await this.prompts.load();
    const roots = await this.roots.list(root);
    const accepted = await this.repositories.list(root);
    const detected = await this.review.listDetected(root);
    const counts = accepted.reduce<Record<string, number>>((result, repository) => {
      result[repository.inspectionStatus] = (result[repository.inspectionStatus] ?? 0) + 1;
      return result;
    }, {});
    clack.note([
      `Workspace: ${name}`,
      `Location: ${root}`,
      `Repository roots: ${roots.filter((item) => item.enabled).length} enabled / ${roots.length} total`,
      `Accepted repositories: ${accepted.length}`,
      `Awaiting review: ${detected.length}`,
      `Graphs: ${counts.READY ?? 0} ready · ${counts.STALE ?? 0} stale · ${counts.NEVER ?? 0} never inspected · ${counts.FAILED ?? 0} failed · ${counts.MISSING ?? 0} missing`,
      `Freshness checked: ${accepted.filter((r) => r.freshnessCheckedAt).length}/${accepted.length}; stored graph state is shown until verification completes.`,
      `Freshness errors: ${accepted.filter((r) => r.freshnessError).length} (see project details)`,
      `Last verification: ${accepted.map((r) => r.freshnessCheckedAt).filter(Boolean).sort().at(-1) ?? 'pending'}`,
      `Graphify: ${this.graphify.cachedVersion ?? 'checking'}`,
      ...(this.backgroundNotice ? [this.backgroundNotice] : []),
    ].join('\n'), 'Current workspace');
  }

  private async discoverFlow(root: string): Promise<void> {
    const clack = await this.prompts.load();
    let configuredRoots = await this.roots.list(root);
    if (configuredRoots.length === 0) {
      clack.note('No repository search folder is configured. Tech Context Graph will ask for one now. It does not assume where your repositories are stored.', 'Repository discovery');
      const created = await this.addRootFlow(root);
      if (!created) return;
      configuredRoots = await this.roots.list(root);
    }
    const enabled = configuredRoots.filter((item) => item.enabled);
    const choice = await this.prompts.requireValue(await clack.select({
      message: 'Which repository search folder should be scanned?',
      options: [
        ...enabled.map((item) => ({ value: item.id, label: item.path, hint: `depth ${item.maxDepth} · confidence ${item.minConfidence}%` })),
        ...(enabled.length > 1 ? [{ value: 'all', label: 'Scan all enabled folders' }] : []),
        { value: 'add', label: 'Add another repository search folder' },
        { value: 'back', label: 'Back' },
      ],
    }));
    if (choice === 'back') return;
    if (choice === 'add') {
      const created = await this.addRootFlow(root);
      if (created) await this.scanRootAndReview(root, created.id);
      return;
    }
    if (choice === 'all') {
      for (const item of enabled) await this.scanRoot(root, item.id);
      await this.reviewCandidatesFlow(root);
      return;
    }
    await this.scanRootAndReview(root, String(choice));
  }

  private async addRootFlow(root: string): Promise<any | undefined> {
    const clack = await this.prompts.load();
    const folder = await this.pathSelection.selectDirectory({
      title: 'Choose the folder tree that contains repositories',
      allowCreate: false,
      includeCurrentDirectory: false,
      recentPaths: (await this.roots.list(root)).map((item) => item.path),
      useCurrentLabel: 'Use this folder as the repository search folder',
    });
    if (!folder) return undefined;
    const maxDepthText = String(await this.prompts.requireValue(await clack.text({
      message: 'Maximum subfolder depth to inspect',
      initialValue: '7',
      validate: (value) => !/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 30 ? 'Use a number between 1 and 30.' : undefined,
    })));
    const confidenceText = String(await this.prompts.requireValue(await clack.text({
      message: 'Minimum technology detection confidence',
      initialValue: '60',
      validate: (value) => !/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 100 ? 'Use a number between 1 and 100.' : undefined,
    })));
    clack.note([
      `Folder: ${folder}`,
      `Maximum depth: ${maxDepthText}`,
      `Minimum confidence: ${confidenceText}%`,
      '',
      'The folder will not be moved or modified. Only its path and scan settings are stored.',
    ].join('\n'), 'Repository root summary');
    const confirmed = await this.prompts.requireValue(await clack.confirm({ message: 'Save this repository search folder?', initialValue: true }));
    if (!confirmed) return undefined;
    const record = await this.roots.add(root, {
      path: folder,
      maxDepth: Number(maxDepthText),
      minConfidence: Number(confidenceText),
      role: 'technology',
    });
    clack.log.success('Repository search folder saved in YAML and SQLite.');
    return record;
  }

  private async scanRootAndReview(root: string, rootId: string): Promise<void> {
    await this.scanRoot(root, rootId);
    await this.reviewCandidatesFlow(root);
  }

  private async scanRoot(root: string, rootId: string): Promise<void> {
    const clack = await this.prompts.load();
    const record = (await this.roots.list(root)).find((item) => item.id === rootId);
    if (!record) throw new Error(`Repository root not found: ${rootId}`);
    const confirmed = await this.prompts.requireValue(await clack.confirm({
      message: `Scan this folder tree?\n${record.path}`,
      initialValue: true,
    }));
    if (!confirmed) return;
    const spinner = clack.spinner();
    spinner.start(`Scanning ${record.path}...`);
    const report = await this.roots.scan(root, rootId);
    spinner.stop(`Detected ${report.candidate_count} candidate repositories in ${report.visited_directories} visited folders.`);
    if (report.truncated) clack.log.warn('The directory limit was reached. Increase maximum_directories only after reviewing the root.');
  }

  private async reviewCandidatesFlow(root: string): Promise<void> {
    const clack = await this.prompts.load();
    const candidates = await this.review.listDetected(root);
    if (candidates.length === 0) {
      clack.log.info('There are no detected repositories awaiting review.');
      return;
    }
    const ids = await this.prompts.requireValue(await clack.autocompleteMultiselect({
      message: 'Search for and accept the repositories you want Tech Context Graph to manage',
      placeholder: 'Type a name, technology, category or path; press Space to select',
      maxItems: 14,
      required: false,
      options: [
        ...candidates.map((item) => ({
          value: item.id,
          label: `${item.key} · ${item.technologyLabel} · ${item.confidence}%`,
          hint: `${item.category} · ${item.path}`,
        })),
        { value: 'back', label: 'Back' },
      ],
      filter: this.presenter.matches,
    }));
    if (ids.includes('back')) return;
    if (ids.length === 0) {
      clack.log.info('No candidates were accepted. They remain available for later review.');
      return;
    }
    const selected = candidates.filter((item) => ids.includes(item.id));
    clack.note(selected.map((item) => `${item.technologyLabel.padEnd(16)} ${item.confidence.toString().padStart(3)}%  ${item.path}`).join('\n'), 'Repositories to accept');
    const confirm = await this.prompts.requireValue(await clack.confirm({
      message: `Accept ${selected.length} repositories into the managed catalog?`,
      initialValue: true,
    }));
    if (!confirm) return;
    const progress = clack.progress({ max: selected.length, style: 'heavy' });
    progress.start(`Accepting 0/${selected.length} repositories...`);
    const result = await this.review.apply(root, selected.map((item) => item.id), [], (item, completed, total) => {
      progress.advance(1, `${completed}/${total} · ${item.key}: ${item.status}`);
    });
    if (result.failed === 0) progress.stop(`${result.accepted}/${selected.length} repositories accepted.`);
    else progress.error(`${result.accepted} accepted; ${result.failed} failed.`);
    const failures = result.items.filter((item) => item.status === 'failed');
    clack.note([
      `Successful: ${result.accepted}`,
      `Failed: ${result.failed}`,
      result.failed === 0
        ? 'Impact: none. All selected repositories are ready for inspection.'
        : 'Impact: important. Failed repositories were not added to the managed catalog.',
      ...failures.map((item) => `- ${item.key}: ${item.error}`),
    ].join('\n'), 'Catalog acceptance summary');
  }

  private async inspectFlow(root: string, pullFirst = false): Promise<void> {
    const clack = await this.prompts.load();
    if (!await this.graphify.isAvailable()) {
      clack.log.error('Graphify is not installed or is not on PATH. Run: uv tool install graphifyy');
      return;
    }
    const repositories = await this.repositories.list(root);
    if (repositories.length === 0) {
      clack.log.warn('There are no accepted repositories. Discover and review repositories first.');
      return;
    }
    const mode = await this.prompts.requireValue(await clack.select({
      message: pullFirst ? 'Which repositories should be pulled and updated?' : 'What would you like to inspect?',
      options: pullFirst
        ? [
            { value: 'all', label: 'All accepted repositories', hint: `${repositories.length} accepted ${repositories.length === 1 ? 'repository' : 'repositories'}.` },
            { value: 'choose', label: 'Choose one or more with search', hint: 'Use Space to select each repository.' },
            { value: 'back', label: 'Back' },
          ]
        : [
            { value: 'pending', label: 'All pending repositories', hint: 'Never inspected, stale, failed or missing graph.' },
            { value: 'choose', label: 'Choose one or more with search' },
            { value: 'single', label: 'Choose one with search' },
            { value: 'back', label: 'Back' },
          ],
    }));
    if (mode === 'back') return;
    let selected: StoredRepository[] = [];
    if (mode === 'all') selected = repositories;
    else if (mode === 'pending') selected = repositories; // The coordinator verifies freshness before deciding to extract.
    else if (mode === 'single') {
      const id = await this.prompts.requireValue(await clack.autocomplete({
        message: 'Search for a repository',
        placeholder: 'Name, technology, category, status or path',
        maxItems: 12,
        options: [...this.presenter.options(repositories), { value: 'back', label: 'Back' }],
        filter: this.presenter.matches,
      }));
      if (id === 'back') return;
      selected = repositories.filter((item) => item.id === id);
    } else {
      const ids = await this.prompts.requireValue(await clack.autocompleteMultiselect({
        message: pullFirst
          ? 'Select the repositories to pull and update with Graphify'
          : 'Search for and select one or more repositories',
        placeholder: 'Type to filter; press Space to select',
        maxItems: 14,
        required: true,
        options: [...this.presenter.options(repositories), { value: 'back', label: 'Back' }],
        filter: this.presenter.matches,
      }));
      if (ids.includes('back')) return;
      selected = repositories.filter((item) => ids.includes(item.id));
    }
    if (selected.length === 0) {
      clack.log.info('No repository matches the selected condition.');
      return;
    }
    clack.note(
      selected.map((item) => `${this.presenter.statusSymbol(item.inspectionStatus)} ${item.key} · ${item.technologyLabel}\n  ${item.path}`).join('\n'),
      pullFirst ? 'Git pull + Graphify selection' : 'Graphify selection',
    );
    const proceed = await this.prompts.requireValue(await clack.confirm({
      message: pullFirst
        ? `Run git pull --ff-only and then Graphify on ${selected.length} selected repository/repositories? Git failures will be skipped without stopping the others.`
        : `Run Graphify sequentially on ${selected.length} repository/repositories?`,
      initialValue: true,
    }));
    if (!proceed) return;
    await this.runUpdates(root, selected, { pull: pullFirst });
  }

  private async runUpdates(root: string, repositories: StoredRepository[], options: { pull?: boolean; force?: boolean }): Promise<void> {
    const clack = await this.prompts.load();
    const spinner = clack.spinner({ indicator: 'timer' });
    spinner.start('Checking repositories...');
    try {
      const report = await this.updates.run(root, repositories, {
        ...options, onProgress: (message, completed, total) => spinner.message(`${completed}/${total} ? ${message}`),
      });
      const failed = report.outcomes.filter((row) => !row.ok).length;
      const aggregateFailures = report.aggregates.filter((item) => ['FAILED', 'CANCELLED'].includes(item.status)).length;
      const summary = `${report.outcomes.length - failed} completed; ${failed} blocked/failed/cancelled; ${aggregateFailures} aggregate issue(s). ${(report.durationMs / 1000).toFixed(1)}s`;
      if (failed || aggregateFailures) spinner.error(summary); else spinner.stop(summary);
      this.showUpdateReport(clack, report);
    } catch (error) { spinner.error(error instanceof Error ? error.message : String(error)); }
    finally { this.repositories.invalidate(root); }
  }

  private showUpdateReport(clack: Awaited<ReturnType<ClackPromptService['load']>>, report: UpdateReport): void {
    clack.note(this.presenter.inspectionTable(report.outcomes), 'Update results');
    const details = report.outcomes.flatMap((row) => [
      `${row.key}: Git ${row.gitStatus} ? graph ${row.graphStatus} ? Git ${(row.gitMs / 1000).toFixed(1)}s / graph ${(row.graphMs / 1000).toFixed(1)}s`,
      ...(row.error ? [`${row.errorCode}: ${row.error}`] : []), ...row.notices,
    ]);
    details.push(...report.aggregates.map((a) => `${a.technology} aggregate: ${a.status}${a.error ? ` ? ${a.error}` : ''}`));
    details.push(`Total wall time: ${(report.durationMs / 1000).toFixed(1)}s`, `Log: ${report.logPath}`);
    clack.note(details.join('\n'), 'Details');
  }

  private async projectDetailFlow(root: string): Promise<void> {
    const clack = await this.prompts.load();
    const repositories = await this.repositories.list(root);
    if (repositories.length === 0) {
      clack.log.info('There are no accepted repositories.');
      return;
    }
    const id = await this.prompts.requireValue(await clack.autocomplete({
      message: 'Search for an inspected project',
      placeholder: 'Name, technology, path or status',
      maxItems: 14,
      options: [...this.presenter.options(repositories), { value: 'back', label: 'Back' }],
      filter: this.presenter.matches,
    }));
    if (id === 'back') return;
    let repository = await this.repositories.get(root, id);
    let active = true;
    while (active) {
      await this.showRepository(repository);
      const action = await this.prompts.requireValue(await clack.select({
        message: `Actions for ${repository.key}`,
        options: [
          { value: 'update', label: 'Update graph', hint: 'Reuse Graphify cache and process changes.' },
          { value: 'pull-update', label: 'Pull latest code + update graph', hint: 'Run git pull --ff-only in the original repository folder first.' },
          { value: 'rebuild', label: 'Fully rebuild graph', hint: 'Use --force.' },
          { value: 'source', label: 'Change source-code folder', hint: 'Choose the directory Graphify should inspect.' },
          { value: 'query', label: 'Query the graph' },
          { value: 'explain', label: 'Explain a node or concept' },
          { value: 'path', label: 'Find a path between two nodes' },
          { value: 'location', label: 'Show repository, source, graph and log locations' },
          { value: 'disable', label: 'Remove from active catalog', hint: 'Does not delete the repository or existing graph.' },
          { value: 'back', label: 'Back' },
        ],
      }));
      switch (action) {
        case 'update': await this.runSingleInspection(root, repository, false); break;
        case 'pull-update': await this.runSingleInspection(root, repository, false, true); break;
        case 'rebuild': await this.runSingleInspection(root, repository, true); break;
        case 'source': await this.changeSourcePathFlow(root, repository); break;
        case 'query': await this.queryFlow(root, repository, 'query'); break;
        case 'explain': await this.queryFlow(root, repository, 'explain'); break;
        case 'path': await this.pathFlow(root, repository); break;
        case 'location': clack.note(`Repository: ${repository.path}\nSource folder: ${repository.sourcePath}\nOutput: ${repository.graphOutput}\nGraph JSON: ${this.repositories.graphPath(root, repository)}\nLogs: ${resolve(root, '.tcg', 'logs')}`, 'File locations'); break;
        case 'disable': {
          const yes = await this.prompts.requireValue(await clack.confirm({ message: `Remove ${repository.key} from the active catalog?`, initialValue: false }));
          if (yes) { await this.store.disable(root, repository.id); clack.log.success('Repository removed from the active catalog.'); active = false; }
          break;
        }
        case 'back': active = false; break;
      }
      if (active) repository = await this.repositories.get(root, repository.id);
    }
  }

  private async rootsFlow(root: string): Promise<void> {
    const clack = await this.prompts.load();
    let active = true;
    while (active) {
      const records = await this.roots.list(root);
      if (records.length) clack.note(records.map((item) => `${item.enabled ? '●' : '○'} ${item.path}\n  depth ${item.maxDepth} · confidence ${item.minConfidence}% · last scan ${item.lastScannedAt ?? 'never'}`).join('\n'), 'Repository search folders');
      else clack.log.info('No repository search folder is configured.');
      const action = await this.prompts.requireValue(await clack.select({
        message: 'Repository root actions',
        options: [
          { value: 'add', label: 'Add a repository search folder' },
          ...(records.length ? [
            { value: 'scan', label: 'Scan one folder' },
            { value: 'scan-all', label: 'Scan all enabled folders' },
            { value: 'toggle', label: 'Enable or disable a folder' },
            { value: 'remove', label: 'Remove a folder from configuration' },
          ] : []),
          { value: 'back', label: 'Back' },
        ],
      }));
      if (action === 'back') { active = false; continue; }
      if (action === 'add') { await this.addRootFlow(root); continue; }
      if (action === 'scan-all') {
        for (const item of records.filter((record) => record.enabled)) await this.scanRoot(root, item.id);
        await this.reviewCandidatesFlow(root);
        continue;
      }
      const selectedId = await this.prompts.requireValue(await clack.autocomplete({
        message: 'Choose a repository search folder',
        options: [
          ...records.map((item) => ({ value: item.id, label: item.path, hint: item.enabled ? 'enabled' : 'disabled' })),
          { value: 'back', label: 'Back' },
        ],
        maxItems: 12,
      }));
      if (selectedId === 'back') continue;
      const selected = records.find((item) => item.id === selectedId)!;
      if (action === 'scan') await this.scanRootAndReview(root, selected.id);
      else if (action === 'toggle') {
        await this.roots.setEnabled(root, selected.id, !selected.enabled);
        clack.log.success(`Folder ${selected.enabled ? 'disabled' : 'enabled'}.`);
      } else if (action === 'remove') {
        const confirmed = await this.prompts.requireValue(await clack.confirm({
          message: `Remove this search folder from configuration?\n${selected.path}\nDetected repositories and graph history will remain.`,
          initialValue: false,
        }));
        if (confirmed) { await this.roots.remove(root, selected.id); clack.log.success('Repository search folder removed.'); }
      }
    }
  }

  private async statusFlow(root: string): Promise<void> {
    const clack = await this.prompts.load();
    const repositories = await this.repositories.list(root);
    const detected = await this.review.listDetected(root);
    const roots = await this.roots.list(root);
    const counts = new Map<string, number>();
    for (const item of repositories) counts.set(item.inspectionStatus, (counts.get(item.inspectionStatus) ?? 0) + 1);
    clack.note([
      `Repository roots: ${roots.length}`,
      `Accepted repositories: ${repositories.length}`,
      `Awaiting review: ${detected.length}`,
      ...['NEVER', 'READY', 'STALE', 'FAILED', 'MISSING'].map((status) => `${this.presenter.statusSymbol(status)} ${this.presenter.statusLabel(status)}: ${counts.get(status) ?? 0}`),
      '',
      'By technology:',
      ...this.presenter.technologyDetails(repositories),
    ].join('\n'), 'Catalog status');
  }

  private async settingsFlow(root: string): Promise<void> {
    const clack = await this.prompts.load();
    clack.note([
      `Workspace marker: ${resolve(root, 'tech-context-graph.workspace.json')}`,
      `Workspace configuration: ${this.config.configPath(root)}`,
      `SQLite operational state: ${this.storePath(root)}`,
      `Graphs: ${resolve(root, 'tech-graphify-out')}`,
      `Reports: ${resolve(root, 'context-pack')}`,
      `Logs: ${resolve(root, '.tcg', 'logs')}`,
      `Global workspace registry: ${this.registry.getRegistryPath()}`,
      '',
      'Editable configuration belongs in tech-context-graph.yaml. Runtime history belongs in SQLite.',
    ].join('\n'), 'Configuration and state files');
  }

  private async runSingleInspection(root: string, repository: StoredRepository, force: boolean, pullFirst = false): Promise<void> {
    await this.runUpdates(root, [repository], { force, pull: pullFirst });
  }

  private async queryFlow(root: string, repository: StoredRepository, action: 'query' | 'explain'): Promise<void> {
    const clack = await this.prompts.load();
    const input = String(await this.prompts.requireValue(await clack.text({
      message: action === 'query' ? 'Enter the question for the graph' : 'Enter the node or concept to explain',
      placeholder: action === 'query' ? 'How does authentication work?' : 'AuthService',
      validate: (value) => (value ?? '').trim().length < 2 ? 'Enter at least two characters.' : undefined,
    })));
    const spinner = clack.spinner({ indicator: 'timer' });
    spinner.start('Querying Graphify...');
    try {
      const result = await this.graphify.query(root, repository, action, input);
      spinner.stop(`Response received in ${result.durationMs} ms.`);
      clack.note(result.output || '(Graphify returned no text)', action === 'query' ? 'Answer' : 'Explanation');
    } catch (error) {
      spinner.error(error instanceof Error ? error.message : String(error));
    }
  }

  private async pathFlow(root: string, repository: StoredRepository): Promise<void> {
    const clack = await this.prompts.load();
    const from = await this.prompts.requireValue(await clack.text({ message: 'Source node', placeholder: 'UserController' }));
    const to = await this.prompts.requireValue(await clack.text({ message: 'Target node', placeholder: 'Database' }));
    const spinner = clack.spinner({ indicator: 'timer' });
    spinner.start('Finding the path...');
    try {
      const result = await this.graphify.query(root, repository, 'path', String(from), String(to));
      spinner.stop('Path calculated.');
      clack.note(result.output || '(No path was found)', 'Result');
    } catch (error) {
      spinner.error(error instanceof Error ? error.message : String(error));
    }
  }

  private async changeSourcePathFlow(root: string, repository: StoredRepository): Promise<void> {
    const clack = await this.prompts.load();
    const folder = await this.pathSelection.selectDirectory({
      title: `Choose the source-code folder for ${repository.key}`,
      allowCreate: false,
      includeCurrentDirectory: true,
      recentPaths: [repository.sourcePath, repository.path],
      useCurrentLabel: 'Use this folder as the source-code folder',
    });
    if (!folder || resolve(folder) === resolve(repository.sourcePath)) return;
    const confirmed = await this.prompts.requireValue(await clack.confirm({
      message: `Use this source-code folder?\n${folder}`,
      initialValue: true,
    }));
    if (!confirmed) return;
    const updated = await this.repositories.setSourcePath(root, repository.id, folder);
    clack.log.success(`Source folder updated to ${updated.sourcePath}. The graph will be marked stale after a previous inspection.`);
  }

  private async showRepository(repository: StoredRepository): Promise<void> {
    const clack = await this.prompts.load();
    clack.note(this.presenter.details(repository).join('\n'), `Project ${repository.key}`);
  }

  private storePath(root: string): string {
    return resolve(root, '.tcg', 'state.sqlite');
  }
}
