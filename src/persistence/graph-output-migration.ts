import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Database } from 'sql.js';
import { canonicalGraphOutput, repositoryGraphOutput } from '../services/graph-output-path';

/** Adopt the old default layout, including folders the user has already moved. */
export function migrateFlatGraphOutputs(db: Database, workspaceRoot: string): void {
  const managedRoot = resolve(workspaceRoot, 'tech-graphify-out');
  const within = (root: string, path: string): boolean => {
    const suffix = relative(root, path);
    return suffix !== '' && suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
  };
  const statement = db.prepare('SELECT id,repo_key,technology,graph_output FROM repositories');
  const plans: Array<{ id: string; output: string; source: string; destination: string }> = [];
  try {
    while (statement.step()) {
      const row = statement.getAsObject();
      const key = String(row.repo_key);
      if (!key || /[\\/]/.test(key) || ['.', '..', 'technologies', 'diagnostics'].includes(key)) continue;
      const current = canonicalGraphOutput(String(row.graph_output)).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
      // Explicit custom outputs and already grouped repositories are left alone.
      if (current !== `tech-graphify-out/${key}`) continue;
      const output = repositoryGraphOutput(String(row.technology), key);
      const source = resolve(managedRoot, key);
      const destination = resolve(workspaceRoot, output);
      if (!within(managedRoot, source) || !within(resolve(managedRoot, 'technologies'), destination)) {
        throw new Error(`Invalid managed graph output for ${key}.`);
      }
      if (existsSync(source) && existsSync(destination)) {
        throw new Error(`Cannot migrate ${key}: both source and destination graph folders exist (${source}, ${destination}).`);
      }
      // Verify existing ancestors too, so a directory junction cannot redirect a move.
      if (existsSync(managedRoot)) {
        const realRoot = realpathSync(managedRoot);
        for (const target of [source, destination]) {
          let ancestor = target;
          while (!existsSync(ancestor)) ancestor = dirname(ancestor);
          if (ancestor !== managedRoot && !within(realRoot, realpathSync(ancestor))) {
            throw new Error(`Refusing to migrate a graph outside the managed output: ${target}`);
          }
          if (existsSync(target) && (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink())) {
            throw new Error(`Expected a regular graph directory: ${target}`);
          }
        }
      }
      plans.push({ id: String(row.id), output, source, destination });
    }
  } finally {
    statement.free();
  }

  // Validate every destination before touching disk; a retry also accepts completed moves.
  for (const plan of plans) {
    if (existsSync(plan.source)) {
      mkdirSync(dirname(plan.destination), { recursive: true });
      renameSync(plan.source, plan.destination);
    }
  }
  db.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    for (const plan of plans) {
      db.run('UPDATE repositories SET graph_output=? WHERE id=?', [plan.output, plan.id]);
      db.run('UPDATE inspections SET graph_output=? WHERE repository_id=?', [plan.output, plan.id]);
      const inspections = db.prepare('SELECT id,graph_json_path FROM inspections WHERE repository_id=? AND graph_json_path IS NOT NULL', [plan.id]);
      const paths: Array<{ id: string; path: string }> = [];
      try {
        while (inspections.step()) {
          const row = inspections.getAsObject();
          const path = String(row.graph_json_path);
          if (within(plan.source, path)) paths.push({ id: String(row.id), path: resolve(plan.destination, relative(plan.source, path)) });
        }
      } finally {
        inspections.free();
      }
      for (const row of paths) db.run('UPDATE inspections SET graph_json_path=? WHERE id=?', [row.path, row.id]);
    }
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}
