import { Injectable } from '@nestjs/common';
import { Database } from 'sql.js';

@Injectable()
export class SqliteMigrationService {
  migrate(db: Database): void {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS scan_roots (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        max_depth INTEGER NOT NULL DEFAULT 7,
        min_confidence INTEGER NOT NULL DEFAULT 60,
        role TEXT NOT NULL DEFAULT 'technology',
        last_scanned_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        repo_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        relative_path TEXT NOT NULL,
        role TEXT NOT NULL,
        category TEXT NOT NULL,
        technology TEXT NOT NULL,
        technology_label TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        markers_json TEXT NOT NULL,
        git_repository INTEGER NOT NULL DEFAULT 0,
        ignore_profile TEXT NOT NULL,
        graph_output TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        catalog_status TEXT NOT NULL DEFAULT 'ACCEPTED',
        discovered_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inspections (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        graph_output TEXT NOT NULL,
        graph_json_path TEXT,
        source_fingerprint TEXT,
        graphify_version TEXT,
        node_count INTEGER,
        edge_count INTEGER,
        command_text TEXT,
        log_path TEXT,
        error_message TEXT,
        FOREIGN KEY(repository_id) REFERENCES repositories(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS inspections_repository_date_idx ON inspections(repository_id, started_at DESC);
      CREATE TABLE IF NOT EXISTS graph_queries (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        action TEXT NOT NULL,
        input_text TEXT NOT NULL,
        output_text TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        duration_ms INTEGER,
        FOREIGN KEY(repository_id) REFERENCES repositories(id) ON DELETE CASCADE
      );
    `);
    this.ensureColumn(db, 'repositories', 'catalog_status', "TEXT NOT NULL DEFAULT 'ACCEPTED'");
    this.ensureMigration(db, 1);
    this.ensureMigration(db, 2);
    this.ensureMigration(db, 3, () => {
      db.run(`UPDATE repositories SET graph_output=REPLACE(graph_output,'./graphify-out/','./tech-graphify-out/')
        WHERE graph_output LIKE './graphify-out/%'`);
      db.run(`UPDATE repositories SET graph_output=REPLACE(graph_output,'graphify-out/','./tech-graphify-out/')
        WHERE graph_output LIKE 'graphify-out/%'`);
      db.run(`UPDATE inspections SET graph_output=REPLACE(graph_output,'./graphify-out/','./tech-graphify-out/')
        WHERE graph_output LIKE './graphify-out/%'`);
      db.run(`UPDATE inspections SET graph_output=REPLACE(graph_output,'graphify-out/','./tech-graphify-out/')
        WHERE graph_output LIKE 'graphify-out/%'`);
    });
    this.ensureMigration(db, 4, () => {
      db.run(`UPDATE inspections SET graph_json_path=REPLACE(
        REPLACE(graph_json_path,'/tech-graphify-out/graph.json','/graphify-out/graph.json'),
        '\\tech-graphify-out\\graph.json','\\graphify-out\\graph.json'
      ) WHERE graph_json_path IS NOT NULL`);
    });
  }

  private ensureColumn(db: Database, table: string, column: string, definition: string): void {
    const result = db.exec(`PRAGMA table_info(${table})`);
    const names = result[0]?.values.map((row) => String(row[1])) ?? [];
    if (!names.includes(column)) db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  private ensureMigration(db: Database, version: number, apply?: () => void): void {
    const result = db.exec(`SELECT version FROM schema_migrations WHERE version = ${version}`);
    if (result.length === 0 || result[0].values.length === 0) {
      apply?.();
      db.run('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', [version, new Date().toISOString()]);
    }
  }
}
