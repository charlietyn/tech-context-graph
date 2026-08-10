import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, parse, resolve } from 'node:path';
import { ClackPromptService } from '../ui/clack-prompt.service';
import { GlobalWorkspaceRegistryService } from './global-workspace-registry.service';

@Injectable()
export class PathSelectionService {
  constructor(
    private readonly prompts: ClackPromptService,
    private readonly registry: GlobalWorkspaceRegistryService,
  ) {}

  async selectDirectory(options: {
    title: string;
    allowCreate?: boolean;
    includeCurrentDirectory?: boolean;
    recentPaths?: string[];
    useCurrentLabel?: string;
  }): Promise<string | undefined> {
    const clack = await this.prompts.load();
    const recent = this.uniquePaths([...(options.recentPaths ?? []), ...this.registry.load().recentPaths]).filter(existsSync);
    const action = await this.prompts.requireValue(await clack.select({
      message: options.title,
      options: [
        { value: 'browse', label: 'Browse folders', hint: 'Navigate the filesystem without assuming a project location.' },
        { value: 'paste', label: 'Type or paste a complete path' },
        ...(recent.length > 0 ? [{ value: 'recent', label: 'Choose a recently used folder' }] : []),
        ...(options.includeCurrentDirectory ? [{ value: 'cwd', label: 'Use the current directory', hint: resolve(process.cwd()) }] : []),
        { value: 'back', label: 'Back' },
      ],
    }));
    if (action === 'back') return undefined;
    if (action === 'cwd') return resolve(process.cwd());
    if (action === 'recent') {
      const selected = await this.prompts.requireValue(await clack.autocomplete({
        message: 'Choose a recent folder',
        options: [
          ...recent.map((path) => ({ value: path, label: path })),
          { value: 'back', label: 'Back' },
        ],
        maxItems: 12,
      }));
      if (selected === 'back') return undefined;
      return resolve(String(selected));
    }
    if (action === 'paste') {
      const value = String(await this.prompts.requireValue(await clack.text({
        message: 'Enter the complete folder path',
        placeholder: platform() === 'win32' ? 'D:\\Development\\Repositories' : '/home/user/projects',
        validate: (input) => {
          if (!input?.trim()) return 'A path is required.';
          const candidate = resolve(input.trim());
          if (existsSync(candidate) && !statSync(candidate).isDirectory()) return 'The path exists but is not a directory.';
          if (!existsSync(candidate) && !options.allowCreate) return 'The directory does not exist.';
          return undefined;
        },
      })));
      const path = resolve(value.trim());
      if (!existsSync(path) && options.allowCreate) {
        const create = await this.prompts.requireValue(await clack.confirm({
          message: `The folder does not exist. Create it?\n${path}`,
          initialValue: true,
        }));
        if (!create) return undefined;
        mkdirSync(path, { recursive: true });
      }
      this.registry.addRecentPath(path);
      return path;
    }

    const startRoot = await this.selectBrowseRoot();
    if (!startRoot) return undefined;
    const path = await this.browseDirectories(startRoot, {
      allowCreate: Boolean(options.allowCreate),
      useCurrentLabel: options.useCurrentLabel ?? 'Use this folder',
    });
    if (!path) return undefined;
    this.registry.addRecentPath(path);
    return path;
  }

  private async browseDirectories(startRoot: string, options: { allowCreate: boolean; useCurrentLabel: string }): Promise<string | undefined> {
    const clack = await this.prompts.load();
    let current = resolve(startRoot);
    while (true) {
      const directories = this.listChildDirectories(current);
      const parent = dirname(current);
      const choice = await this.prompts.requireValue(await clack.autocomplete({
        message: `Browsing ${current}`,
        maxItems: 18,
        options: [
          ...directories.map((path) => ({ value: path, label: this.folderLabel(path), hint: 'Open folder' })),
          { value: '__tcg_use_current__', label: options.useCurrentLabel, hint: current },
          ...(this.samePath(parent, current) ? [] : [{ value: '__tcg_parent__', label: 'Go to parent folder', hint: parent }]),
          ...(options.allowCreate ? [{ value: '__tcg_create__', label: 'Create a folder here' }] : []),
          { value: '__tcg_back__', label: 'Back' },
        ],
      }));
      const selected = String(choice);
      if (selected === '__tcg_back__') return undefined;
      if (selected === '__tcg_parent__') {
        current = parent;
        continue;
      }
      if (selected === '__tcg_use_current__') return current;
      if (selected === '__tcg_create__') {
        const created = await this.createFolderFromPrompt(current);
        if (created) current = created;
        continue;
      }
      current = resolve(selected);
    }
  }

  private async createFolderFromPrompt(current: string): Promise<string | undefined> {
    const clack = await this.prompts.load();
    const value = await this.prompts.requireValue(await clack.text({
      message: 'New folder name or complete path',
      placeholder: 'workspace',
      validate: (input) => {
        if (!input?.trim()) return 'A folder name or path is required.';
        const candidate = resolve(current, input.trim());
        if (existsSync(candidate) && !statSync(candidate).isDirectory()) return 'The path exists but is not a directory.';
        return undefined;
      },
    }));
    const path = resolve(current, String(value).trim());
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
    return path;
  }

  private listChildDirectories(path: string): string[] {
    try {
      return readdirSync(path, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => resolve(path, entry.name))
        .sort((left, right) => this.folderLabel(left).localeCompare(this.folderLabel(right)));
    } catch {
      return [];
    }
  }

  private folderLabel(path: string): string {
    return `${parse(path).base || path}/`;
  }

  private async selectBrowseRoot(): Promise<string | undefined> {
    const clack = await this.prompts.load();
    if (platform() !== 'win32') {
      const value = await this.prompts.requireValue(await clack.select({
        message: 'Where should folder browsing begin?',
        options: [
          { value: homedir(), label: 'Home folder', hint: homedir() },
          { value: '/', label: 'Filesystem root', hint: '/' },
          { value: 'back', label: 'Back' },
        ],
      }));
      if (value === 'back') return undefined;
      return String(value);
    }
    const candidates: string[] = [];
    for (let code = 65; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;
      if (existsSync(drive)) candidates.push(drive);
    }
    if (candidates.length === 0) return parse(resolve(process.cwd())).root;
    const value = await this.prompts.requireValue(await clack.select({
      message: 'Choose a drive',
      options: [
        ...candidates.map((drive) => ({ value: drive, label: drive })),
        { value: 'back', label: 'Back' },
      ],
    }));
    if (value === 'back') return undefined;
    return String(value);
  }

  private uniquePaths(paths: string[]): string[] {
    const seen = new Set<string>();
    return paths.map((path) => resolve(path)).filter((path) => {
      const key = path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private samePath(left: string, right: string): boolean {
    return resolve(left).toLowerCase() === resolve(right).toLowerCase();
  }
}
