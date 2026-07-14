import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Command, CommandRunner, Option } from 'nest-commander';
import { WorkspaceConfigService } from '../services/config.service';
import { resolveWorkspacePath } from './common-options';

interface DoctorOptions { workspace?: string; root?: string; json?: boolean }
interface DoctorCheck { name: string; ok: boolean; detail: string }

@Command({ name: 'doctor', description: 'Check Node, Python, Graphify, Git, workspace configuration, and local paths.' })
export class DoctorCommand extends CommandRunner {
  constructor(private readonly config: WorkspaceConfigService) { super(); }

  async run(_params: string[], options: DoctorOptions): Promise<void> {
    const workspace = resolveWorkspacePath(options.workspace, options.root);
    const configuration = this.config.load(workspace);
    const graphify = String(configuration.graphify?.executable ?? 'graphify');
    const checks: DoctorCheck[] = [
      { name: 'Node.js', ok: true, detail: process.version },
      this.commandCheck('Python', process.platform === 'win32' ? 'python' : 'python3', ['--version']),
      this.commandCheck('Git', 'git', ['--version']),
      this.commandCheck('Graphify', graphify, ['--version']),
      this.pathCheck('Workspace marker', resolve(workspace, 'tech-context-graph.workspace.json')),
      this.pathCheck('Workspace configuration', this.config.configPath(workspace)),
      this.pathCheck('Repository database directory', resolve(workspace, '.tcg')),
      this.pathCheck('Graph output directory', resolve(workspace, 'tech-graphify-out')),
    ];

    if (options.json) console.log(JSON.stringify({ workspace, checks }, null, 2));
    else {
      console.log(`Workspace: ${workspace}`);
      for (const check of checks) console.log(`${check.ok ? 'OK' : 'FAILED'}\t${check.name}\t${check.detail}`);
    }
    if (checks.some((check) => !check.ok)) process.exitCode = 1;
  }

  private commandCheck(name: string, command: string, args: string[]): DoctorCheck {
    const result = spawnSync(command, args, { encoding: 'utf8', shell: false, windowsHide: true });
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    return {
      name,
      ok: result.status === 0,
      detail: detail || (result.error?.message ?? `${command} exited with status ${result.status}`),
    };
  }

  private pathCheck(name: string, path: string): DoctorCheck {
    return { name, ok: existsSync(path), detail: path };
  }

  @Option({ flags: '-w, --workspace <path>' }) parseWorkspace(value: string): string { return value; }
  @Option({ flags: '-r, --root <path>', description: 'Deprecated alias for --workspace.' }) parseRoot(value: string): string { return value; }
  @Option({ flags: '--json' }) parseJson(): boolean { return true; }
}
