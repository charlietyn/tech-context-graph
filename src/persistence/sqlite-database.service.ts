import { acquireLockSync } from '../services/operation-lock';
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
  private releaseDatabase?: () => void;
  private opening?: Promise<Database>;
  private openingPath?: string;

  constructor(
    private readonly paths: WorkspaceDatabasePathService = new WorkspaceDatabasePathService(),
    private readonly migrations: SqliteMigrationService = new SqliteMigrationService(),
  ) {}

  async open(workspaceRoot: string): Promise<Database> {
    const target = this.resolveDatabasePath(workspaceRoot);
    if (this.database && this.databasePath === target) return this.database;
    if (this.opening) {
      if (this.openingPath !== target) throw new Error('Cannot open another workspace while the database is opening.');
      return this.opening;
    }
    this.openingPath = target;
    this.opening = this.openDatabase(workspaceRoot, target);
    try { return await this.opening; } finally { this.opening = undefined; this.openingPath = undefined; }
  }

  private async openDatabase(workspaceRoot: string, target: string): Promise<Database> {
    this.close();
    this.releaseDatabase = acquireLockSync(`${target}.lock`);
    try {
      this.sql ??= await initSqlJs({ locateFile: (file) => nodeRequire.resolve(`sql.js/dist/${file}`) });
      mkdirSync(dirname(target), { recursive: true });
      this.database = existsSync(target) ? new this.sql.Database(readFileSync(target)) : new this.sql.Database();
      this.databasePath = target;
      this.migrations.migrate(this.database, workspaceRoot);
      this.persist();
      return this.database;
    } catch (error) {
      this.database?.close();
      this.database = undefined;
      this.databasePath = undefined;
      this.releaseDatabase?.();
      this.releaseDatabase = undefined;
      throw error;
    }
  }

  async run(workspaceRoot: string, sql: string, params: unknown[] = []): Promise<void> {
    const db = await this.open(workspaceRoot);
    db.run(sql, params as any[]);
    this.persist();
  }

  async transaction(workspaceRoot: string, callback: (db: Database) => void): Promise<void> {
    const db = await this.open(workspaceRoot);
    db.run('BEGIN IMMEDIATE TRANSACTION');
    let committed = false;
    try {
      callback(db);
      db.run('COMMIT');
      committed = true;
      this.persist();
    } catch (error) {
      if (!committed) db.run('ROLLBACK');
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
    this.releaseDatabase?.(); this.releaseDatabase = undefined;
  }

  onModuleDestroy(): void { this.close(); }

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
