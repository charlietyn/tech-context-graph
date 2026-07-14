import { Injectable } from '@nestjs/common';
import type * as Clack from '@clack/prompts';

export type ClackModule = typeof import('@clack/prompts');

@Injectable()
export class ClackPromptService {
  private modulePromise?: Promise<ClackModule>;

  load(): Promise<ClackModule> {
    this.modulePromise ??= this.dynamicImport('@clack/prompts');
    return this.modulePromise;
  }

  async requireValue<T>(value: T | symbol, message = 'Operation cancelled.'): Promise<T> {
    const clack = await this.load();
    if (clack.isCancel(value)) {
      clack.cancel(message);
      throw new Error('TCG_CANCELLED');
    }
    return value as T;
  }

  private dynamicImport(specifier: string): Promise<ClackModule> {
    const importer = new Function('moduleName', 'return import(moduleName)') as (moduleName: string) => Promise<ClackModule>;
    return importer(specifier);
  }
}
