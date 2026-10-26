import { RepositoryUpdateService } from './services/repository-update.service';
import { Module } from '@nestjs/common';
import { StartCommand } from './commands/start.command';
import { DoctorCommand } from './commands/doctor.command';
import { ProjectAddCommand, ProjectListCommand } from './commands/project.commands';
import { ProjectDiscoverCommand, ProjectReviewCommand, ProjectPrepareCommand, ProjectRefreshCommand } from './commands/repository-discovery.commands';
import { KitPathService } from './services/kit-path.service';
import { TechnologyCatalogService } from './services/technology-catalog.service';
import { RepositoryDiscoveryService } from './services/repository-discovery.service';
import { RepositoryFingerprintService } from './services/repository-fingerprint.service';
import { GraphifyCliService } from './services/graphify-cli.service';
import { InspectionReconcileService } from './services/inspection-reconcile.service';
import { RepositoryControlService } from './services/repository-control.service';
import { ClackPromptService } from './ui/clack-prompt.service';
import { ConsoleUiService } from './ui/console-ui.service';
import { RepositoryUiPresenterService } from './ui/repository-ui-presenter.service';
import { UiCommand } from './commands/ui.command';
import { RepositoryClassifyCommand, RepositoryInspectCommand, RepositoryListCommand, RepositoryReconcileCommand, RepositoryScanCommand, RepositorySetSourceCommand } from './commands/repository-control.commands';
import { GlobalWorkspaceRegistryService } from './services/global-workspace-registry.service';
import { WorkspaceMarkerService } from './services/workspace-marker.service';
import { WorkspaceResolverService } from './services/workspace-resolver.service';
import { PathSelectionService } from './services/path-selection.service';
import { WorkspaceInitializerService } from './services/workspace-initializer.service';
import { WorkspaceOnboardingService } from './services/workspace-onboarding.service';
import { RepositoryRootService } from './services/repository-root.service';
import { CatalogReviewService } from './services/catalog-review.service';
import { WorkspaceCreateCommand, WorkspaceListCommand, WorkspaceRemoveCommand, WorkspaceUseCommand } from './commands/workspace.commands';
import { RootAddCommand, RootDisableCommand, RootEnableCommand, RootListCommand, RootRemoveCommand, RootScanCommand } from './commands/root.commands';
import { RepositoryReviewCommand } from './commands/catalog.commands';
import { ConfigPathsCommand, ConfigShowCommand, ConfigValidateCommand } from './commands/config.commands';
import { ConfigurationModule } from './configuration.module';
import { PersistenceModule } from './persistence.module';
import { TechnologyGraphService } from './services/technology-graph.service';
import { GraphifyIgnoreService } from './services/graphify-ignore.service';
import { RepositoryGitService } from './services/repository-git.service';

@Module({
  imports: [ConfigurationModule, PersistenceModule],
  providers: [
    KitPathService,
    TechnologyCatalogService,
    RepositoryDiscoveryService,
    RepositoryFingerprintService,
    RepositoryGitService,
    RepositoryUpdateService,
    GraphifyCliService,
    InspectionReconcileService,
    RepositoryControlService,
    GlobalWorkspaceRegistryService,
    WorkspaceMarkerService,
    WorkspaceResolverService,
    PathSelectionService,
    WorkspaceInitializerService,
    WorkspaceOnboardingService,
    RepositoryRootService,
    CatalogReviewService,
    TechnologyGraphService,
    GraphifyIgnoreService,
    ClackPromptService,
    ConsoleUiService,
    RepositoryUiPresenterService,
    UiCommand,
    WorkspaceCreateCommand,
    WorkspaceListCommand,
    WorkspaceUseCommand,
    WorkspaceRemoveCommand,
    RootListCommand,
    RootAddCommand,
    RootScanCommand,
    RootEnableCommand,
    RootDisableCommand,
    RootRemoveCommand,
    RepositoryReviewCommand,
    ConfigPathsCommand,
    ConfigShowCommand,
    ConfigValidateCommand,
    RepositoryListCommand,
    RepositoryScanCommand,
    RepositoryInspectCommand,
    RepositoryReconcileCommand,
    RepositoryClassifyCommand,
    RepositorySetSourceCommand,
    StartCommand,
    DoctorCommand,
    ProjectAddCommand,
    ProjectListCommand,
    ProjectDiscoverCommand,
    ProjectReviewCommand,
    ProjectPrepareCommand,
    ProjectRefreshCommand,
  ],
})
export class CliModule {}
