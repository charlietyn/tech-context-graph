import { Command, CommandRunner, Option } from 'nest-commander';
import { WorkspaceInitializerService } from '../services/workspace-initializer.service';
import { WorkspaceOnboardingService } from '../services/workspace-onboarding.service';

interface StartOptions {
  workspace?: string;
  projectName?: string;
  nonInteractive?: boolean;
}

@Command({ name: 'start', description: 'Create or open a workspace through the same Clack onboarding used by the main UI.' })
export class StartCommand extends CommandRunner {
  constructor(
    private readonly onboarding: WorkspaceOnboardingService,
    private readonly initializer: WorkspaceInitializerService,
  ) { super(); }

  async run(_params: string[], options: StartOptions): Promise<void> {
    if (options.nonInteractive) {
      if (!options.workspace || !options.projectName) throw new Error('--non-interactive requires --workspace and --project-name.');
      const workspace = await this.initializer.create(options.workspace, options.projectName);
      console.log(JSON.stringify(workspace, null, 2));
      return;
    }
    const workspace = await this.onboarding.chooseOrCreate();
    if (workspace) console.log(`Active workspace: ${workspace.name}\n${workspace.path}`);
  }

  @Option({ flags: '-w, --workspace <path>', description: 'Workspace path for non-interactive creation.' })
  parseWorkspace(value: string): string { return value; }

  @Option({ flags: '-n, --project-name <name>', description: 'Workspace name for non-interactive creation.' })
  parseProjectName(value: string): string { return value; }

  @Option({ flags: '--non-interactive', description: 'Create without prompts.' })
  parseNonInteractive(): boolean { return true; }
}
