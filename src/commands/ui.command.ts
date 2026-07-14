import { Command, CommandRunner, Option } from 'nest-commander';
import { ConsoleUiService } from '../ui/console-ui.service';
import { resolveWorkspacePath } from './common-options';

@Command({ name: 'ui', description: 'Open the minimal interactive Tech Context Graph interface.' })
export class UiCommand extends CommandRunner {
  constructor(private readonly ui: ConsoleUiService) { super(); }
  async run(_params: string[], options: { workspace?: string; root?: string }): Promise<void> {
    await this.ui.run(resolveWorkspacePath(options.workspace, options.root));
  }
  @Option({ flags: '-w, --workspace <path>', description: 'Explicit workspace path.' })
  parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>', description: 'Deprecated alias for --workspace.' })
  parseRoot(value: string): string { return value; }
}
