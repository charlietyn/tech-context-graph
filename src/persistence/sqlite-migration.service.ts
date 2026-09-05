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
        source_path TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        role TEXT NOT NULL,
        category TEXT NOT NULL,
        technology TEXT NOT NULL,
        technology_label TEXT NOT NULL,
        artifact_kind TEXT NOT NULL DEFAULT 'unknown',
        package_ecosystem TEXT NOT NULL DEFAULT 'unknown',
        package_name TEXT,
        package_version TEXT,
        technology_version TEXT,
        technology_constraints_json TEXT NOT NULL DEFAULT '[]',
        classification_evidence_json TEXT NOT NULL DEFAULT '[]',
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
    this.ensureColumn(db, 'repositories', 'artifact_kind', "TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn(db, 'repositories', 'package_ecosystem', "TEXT NOT NULL DEFAULT 'unknown'");
    this.ensureColumn(db, 'repositories', 'package_name', 'TEXT');
    this.ensureColumn(db, 'repositories', 'package_version', 'TEXT');
    this.ensureColumn(db, 'repositories', 'technology_version', 'TEXT');
    this.ensureColumn(db, 'repositories', 'technology_constraints_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn(db, 'repositories', 'classification_evidence_json', "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn(db, 'repositories', 'source_path', 'TEXT');
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
    this.ensureMigration(db, 5, () => {
      db.run(`UPDATE repositories SET artifact_kind='library' WHERE role='library' AND artifact_kind='unknown'`);
    });
    this.ensureMigration(db, 6, () => this.migrateVersionedLegacyCores(db));
    this.ensureMigration(db, 7, () => {
      const statement = db.prepare(`SELECT id,technology FROM repositories
        WHERE role='technology' AND artifact_kind='unknown' AND technology<>'unknown' AND repo_key=technology`);
      const rows: Array<{ id: string; technology: string }> = [];
      try {
        while (statement.step()) {
          const row = statement.getAsObject();
          rows.push({ id: String(row.id), technology: String(row.technology) });
        }
      } finally {
        statement.free();
      }
      for (const row of rows) {
        const key = `${row.technology}-core-unknown`;
        const collision = db.prepare('SELECT 1 FROM repositories WHERE repo_key=? AND id<>? LIMIT 1', [key, row.id]);
        try {
          if (collision.step()) continue;
        } finally {
          collision.free();
        }
        db.run(`UPDATE repositories SET repo_key=?,artifact_kind='core',classification_evidence_json=?,updated_at=?
          WHERE id=?`, [key, JSON.stringify(['legacy-core:version-unavailable']), new Date().toISOString(), row.id]);
      }
    });
    this.ensureMigration(db, 8, () => {
      db.run('UPDATE repositories SET source_path=path WHERE source_path IS NULL OR source_path=\'\'');
    });
  }

  private migrateVersionedLegacyCores(db: Database): void {
    const statement = db.prepare(`SELECT id,repo_key,path,technology,graph_output
      FROM repositories
      WHERE role='technology' AND artifact_kind='unknown' AND technology<>'unknown'`);
    const rows: Array<Record<string, unknown>> = [];
    try {
      while (statement.step()) rows.push(statement.getAsObject());
    } finally {
      statement.free();
    }
    for (const row of rows) {
      const sourcePath = String(row.path ?? '');
      const versions = [...sourcePath.matchAll(/(?:^|[\\/])v?(\d{1,3})(?=[\\/]|$)/gi)];
      const version = versions.at(-1)?.[1];
      if (!version) continue;
      const id = String(row.id);
      const technology = String(row.technology);
      const key = `${technology}-core-${version}`;
      const collision = db.prepare('SELECT 1 FROM repositories WHERE repo_key=? AND id<>? LIMIT 1', [key, id]);
      let occupied = false;
      try {
        occupied = collision.step();
      } finally {
        collision.free();
      }
      if (occupied) continue;
      db.run(`UPDATE repositories SET repo_key=?,artifact_kind='core',technology_version=?,
        classification_evidence_json=?,updated_at=? WHERE id=?`, [
        key,
        version,
        JSON.stringify([`legacy-path-version:${version}`]),
        new Date().toISOString(),
        id,
      ]);
    }
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
