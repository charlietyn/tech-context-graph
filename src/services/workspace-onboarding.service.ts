import { Injectable } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { WorkspaceReference } from '../models/workspace';
import { ClackPromptService } from '../ui/clack-prompt.service';
import { GlobalWorkspaceRegistryService } from './global-workspace-registry.service';
import { PathSelectionService } from './path-selection.service';
import { WorkspaceInitializerService } from './workspace-initializer.service';
import { WorkspaceMarkerService } from './workspace-marker.service';

@Injectable()
export class WorkspaceOnboardingService {
  constructor(
    private readonly prompts: ClackPromptService,
    private readonly registry: GlobalWorkspaceRegistryService,
    private readonly pathSelection: PathSelectionService,
    private readonly initializer: WorkspaceInitializerService,
    private readonly markers: WorkspaceMarkerService,
  ) {}

  async chooseOrCreate(options: { allowLastShortcut?: boolean } = {}): Promise<WorkspaceReference | undefined> {
    const clack = await this.prompts.load();
    const workspaces = this.registry.listValid();
    if (workspaces.length === 0) {
      clack.note('No Tech Context Graph workspace is configured. A workspace stores SQLite state, graphs, logs and configuration. Your repositories remain in their original folders.', 'First run');
      return this.firstRun();
    }
    const duplicateNames = this.duplicateWorkspaceNames(workspaces);
    while (true) {
      const choice = await this.prompts.requireValue(await clack.autocomplete({
        message: 'Choose a workspace or create/open another one',
        maxItems: 12,
        options: [
          ...workspaces.map((workspace) => ({ value: `workspace:${workspace.id}`, label: this.workspaceLabel(workspace, duplicateNames), hint: workspace.path })),
          { value: 'create', label: 'Create a new workspace' },
          { value: 'open', label: 'Open or adopt an existing folder' },
          { value: 'exit', label: 'Exit' },
        ],
      }));
      if (choice === 'exit') return undefined;
      if (choice === 'create') {
        const workspace = await this.createFlow();
        if (workspace) return workspace;
        continue;
      }
      if (choice === 'open') {
        const workspace = await this.openFlow();
        if (workspace) return workspace;
        continue;
      }
      const workspace = workspaces.find((item) => `workspace:${item.id}` === choice);
      if (workspace) return this.registry.markOpened(workspace);
    }
  }

  private async firstRun(): Promise<WorkspaceReference | undefined> {
    const clack = await this.prompts.load();
    while (true) {
      const action = await this.prompts.requireValue(await clack.select({
        message: 'How would you like to continue?',
        options: [
          { value: 'create', label: 'Create a new workspace', hint: 'Recommended for a new installation.' },
          { value: 'open', label: 'Open or adopt an existing workspace' },
          { value: 'exit', label: 'Exit' },
        ],
      }));
      if (action === 'exit') return undefined;
      if (action === 'create') {
        const workspace = await this.createFlow();
        if (workspace) return workspace;
        continue;
      }
      if (action === 'open') {
        const workspace = await this.openFlow();
        if (workspace) return workspace;
      }
    }
  }

  private async createFlow(): Promise<WorkspaceReference | undefined> {
    const clack = await this.prompts.load();
    const name = String(await this.prompts.requireValue(await clack.text({
      message: 'Workspace name',
      placeholder: 'Company Technology Catalog',
      validate: (value) => !value?.trim() ? 'A name is required.' : undefined,
    })));
    const path = await this.pathSelection.selectDirectory({
      title: 'Where should Tech Context Graph store its database, graphs, reports and logs?',
      allowCreate: true,
      includeCurrentDirectory: true,
      useCurrentLabel: 'Use this folder as the workspace',
    });
    if (!path) return undefined;
    clack.note([
      `Name: ${name.trim()}`,
      `Location: ${path}`,
      '',
      'The application will create:',
      `${path}\\.tcg`,
      `${path}\\tech-graphify-out`,
      `${path}\\context-pack`,
      `${path}\\tech-context-graph.yaml`,
    ].join('\n'), 'Workspace summary');
    const confirmed = await this.prompts.requireValue(await clack.confirm({ message: 'Create this workspace?', initialValue: true }));
    if (!confirmed) return undefined;
    const spinner = clack.spinner();
    spinner.start('Creating workspace...');
    const workspace = await this.initializer.create(path, name.trim());
    spinner.stop('Workspace created successfully.');
    return workspace;
  }

  private async openFlow(): Promise<WorkspaceReference | undefined> {
    const clack = await this.prompts.load();
    const path = await this.pathSelection.selectDirectory({
      title: 'Choose the existing workspace folder',
      allowCreate: false,
      includeCurrentDirectory: true,
      useCurrentLabel: 'Use this folder as the workspace',
    });
    if (!path) return undefined;
    const marker = this.markers.read(path);
    if (marker) {
      return this.registry.register({ id: marker.id, name: marker.name, path, createdAt: marker.createdAt });
    }
    if (!this.markers.isLegacyWorkspace(path)) {
      clack.log.error('The selected folder does not contain a workspace marker or recognizable legacy Tech Context Graph data.');
      return undefined;
    }
    const adopt = await this.prompts.requireValue(await clack.confirm({
      message: 'This looks like a legacy Tech Context Graph workspace. Adopt it and create the new workspace marker?',
      initialValue: true,
    }));
    if (!adopt) return undefined;
    const defaultName = basename(resolve(path)) || 'Imported workspace';
    const name = String(await this.prompts.requireValue(await clack.text({
      message: 'Workspace name',
      initialValue: defaultName,
    })));
    return this.initializer.adopt(path, name.trim() || defaultName);
  }

  private duplicateWorkspaceNames(workspaces: WorkspaceReference[]): Set<string> {
    const counts = new Map<string, number>();
    for (const workspace of workspaces) {
      const key = workspace.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name));
  }

  private workspaceLabel(workspace: WorkspaceReference, duplicateNames: Set<string>): string {
    if (!duplicateNames.has(workspace.name.trim().toLowerCase())) return workspace.name;
    return `${workspace.name} · ${basename(resolve(workspace.path)) || workspace.path}`;
  }
}
