import { mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OperationError } from './process-runner';

/** Exclusive local-process ownership, including guarded recovery of a dead owner. */
export function acquireLockSync(path: string): () => void {
  mkdirSync(dirname(path), { recursive: true });
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = openSync(path, 'wx');
      try { writeFileSync(file, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() })); }
      finally { closeSync(file); }
      return () => {
        const current = JSON.parse(readFileSync(path, 'utf8'));
        if (current.token !== token) throw new OperationError('LOCKED', `Lock ownership changed: ${path}`);
        unlinkSync(path);
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let recovery: number;
      try { recovery = openSync(`${path}.recovery`, 'wx'); }
      catch { throw new OperationError('LOCKED', `Another controller is recovering ${path}`); }
      try {
        let owner: number;
        try { owner = JSON.parse(readFileSync(path, 'utf8')).pid; }
        catch (readError) {
          if ((readError as NodeJS.ErrnoException).code === 'ENOENT' && attempt === 0) continue;
          throw new OperationError('LOCKED', `Unrecognized operation lock: ${resolve(path)}`);
        }
        if (!Number.isInteger(owner) || owner <= 0) throw new OperationError('LOCKED', `Invalid lock owner: ${path}`);
        try { process.kill(owner, 0); }
        catch (probe) {
          if ((probe as NodeJS.ErrnoException).code === 'ESRCH' && attempt === 0) { unlinkSync(path); continue; }
        }
        throw new OperationError('LOCKED', `Another operation (PID ${owner}) owns ${path}`);
      } finally { closeSync(recovery); unlinkSync(`${path}.recovery`); }
    }
  }
  throw new OperationError('LOCKED', `Could not acquire ${path}`);
}

export async function acquireLock(path: string): Promise<() => Promise<void>> {
  const release = acquireLockSync(path);
  return async () => release();
}
