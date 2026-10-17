import { Injectable } from '@nestjs/common';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SqliteMigrationService } from './sqlite-migration.service';
import { WorkspaceDatabasePathService } from './workspace-database-path.service';

const nodeRequire = createRequire(__filename);

@Injectable()
export class SqliteDatabaseService {
  private sql?: SqlJsStatic;
  private database?: Database;
  private databasePath?: string;

  constructor(
    private readonly paths: WorkspaceDatabasePathService = new WorkspaceDatabasePathService(),
    private readonly migrations: SqliteMigrationService = new SqliteMigrationService(),
  ) {}

  async open(workspaceRoot: string): Promise<Database> {
    const target = this.resolveDatabasePath(workspaceRoot);
    if (this.database && this.databasePath === target) return this.database;
    this.close();
    this.sql ??= await initSqlJs({ locateFile: (file) => nodeRequire.resolve(`sql.js/dist/${file}`) });
    mkdirSync(dirname(target), { recursive: true });
    this.database = existsSync(target) ? new this.sql.Database(readFileSync(target)) : new this.sql.Database();
    this.databasePath = target;
    try {
      this.migrations.migrate(this.database, workspaceRoot);
      this.persist();
    } catch (error) {
      this.database.close();
      this.database = undefined;
      this.databasePath = undefined;
      throw error;
    }
    return this.database;
  }

  async run(workspaceRoot: string, sql: string, params: unknown[] = []): Promise<void> {
    const db = await this.open(workspaceRoot);
    db.run(sql, params as any[]);
    this.persist();
  }

  async transaction(workspaceRoot: string, callback: (db: Database) => void): Promise<void> {
    const db = await this.open(workspaceRoot);
    db.run('BEGIN IMMEDIATE TRANSACTION');
    try {
      callback(db);
      db.run('COMMIT');
      this.persist();
    } catch (error) {
      db.run('ROLLBACK');
      throw error;
    }
  }

  async all<T>(workspaceRoot: string, sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.open(workspaceRoot);
    const statement = db.prepare(sql, params as any[]);
    const rows: T[] = [];
    try {
      while (statement.step()) rows.push(statement.getAsObject() as T);
    } finally {
      statement.free();
    }
    return rows;
  }

  async get<T>(workspaceRoot: string, sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.all<T>(workspaceRoot, sql, params))[0];
  }

  getPath(workspaceRoot: string): string {
    return this.resolveDatabasePath(workspaceRoot);
  }

  close(): void {
    if (this.database) {
      this.persist();
      this.database.close();
    }
    this.database = undefined;
    this.databasePath = undefined;
  }

  private resolveDatabasePath(workspaceRoot: string): string {
    return this.paths.resolve(workspaceRoot);
  }

  private persist(): void {
    if (!this.database || !this.databasePath) return;
    const temporary = `${this.databasePath}.tmp`;
    writeFileSync(temporary, Buffer.from(this.database.export()));
    renameSync(temporary, this.databasePath);
  }

}
