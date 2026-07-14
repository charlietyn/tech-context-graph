import { Module } from '@nestjs/common';
import { WorkspaceConfigService } from './services/config.service';
import { WorkspaceConfigValidationService } from './services/config-validation.service';

@Module({
  providers: [WorkspaceConfigValidationService, WorkspaceConfigService],
  exports: [WorkspaceConfigValidationService, WorkspaceConfigService],
})
export class ConfigurationModule {}
