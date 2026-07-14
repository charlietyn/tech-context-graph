import { Module } from '@nestjs/common';
import { ConfigurationModule } from './configuration.module';
import { RepositoryStoreService } from './persistence/repository-store.service';
import { SqliteDatabaseService } from './persistence/sqlite-database.service';
import { SqliteMigrationService } from './persistence/sqlite-migration.service';
import { WorkspaceDatabasePathService } from './persistence/workspace-database-path.service';

@Module({
  imports: [ConfigurationModule],
  providers: [WorkspaceDatabasePathService, SqliteMigrationService, SqliteDatabaseService, RepositoryStoreService],
  exports: [WorkspaceDatabasePathService, SqliteDatabaseService, RepositoryStoreService],
})
export class PersistenceModule {}
