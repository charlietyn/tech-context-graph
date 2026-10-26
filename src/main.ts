#!/usr/bin/env node
import 'reflect-metadata';
import { CommandFactory } from 'nest-commander';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli.module';
import { ConsoleUiService } from './ui/console-ui.service';
import { WorkspaceOnboardingService } from './services/workspace-onboarding.service';
import { WorkspaceResolverService } from './services/workspace-resolver.service';

function workspaceFromArgs(args: string[]): string | undefined {
  const index = args.findIndex((value) => value === '--workspace' || value === '-w' || value === '--root' || value === '-r');
  return index >= 0 ? args[index + 1] : undefined;
}

async function bootstrap(): Promise<void> {
  const args = process.argv.slice(2);
  const launchUi = args.length === 0 || args[0] === 'ui';
  if (launchUi && process.stdin.isTTY && process.stdout.isTTY) {
    const application = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
    try {
      const resolver = application.get(WorkspaceResolverService);
      const onboarding = application.get(WorkspaceOnboardingService);
      const ui = application.get(ConsoleUiService);
      let explicit = workspaceFromArgs(args);
      let running = true;
      while (running) {
        let workspace;
        if (explicit) {
          const resolution = resolver.fromPath(explicit, 'cli');
          workspace = resolution.workspace;
          explicit = undefined;
        } else {
          workspace = await onboarding.chooseOrCreate();
        }
        if (!workspace) break;
        const result = await ui.run(workspace.path);
        if (result !== 'SWITCH_WORKSPACE') running = false;
      }
    } finally {
      await application.close();
    }
    return;
  }

  await CommandFactory.run(CliModule, {
    logger: ['error'],
    serviceErrorHandler: (error: Error) => {
      if (error.message !== 'TCG_CANCELLED') console.error(`ERROR: ${error.message}`);
      process.exitCode = error.message === 'TCG_CANCELLED' ? 0 : 2;
    },
  });
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message !== 'TCG_CANCELLED') console.error(`ERROR: ${message}`);
  process.exitCode = message === 'TCG_CANCELLED' ? 0 : 2;
});
