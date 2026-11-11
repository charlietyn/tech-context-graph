import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OperationError } from './process-runner';

/** The owner touches its lock this often; a lock that declares a heartbeat and is older than STALE is dead. */
export const LOCK_HEARTBEAT_MS = 30_000;
export const LOCK_STALE_MS = 15 * 60_000;

export interface LockOptions {
  /** Test hook; production uses LOCK_HEARTBEAT_MS. */
  heartbeatMs?: number;
  staleMs?: number;
}

/**
 * Linux process start time (clock ticks since boot, field 22 of /proc/<pid>/stat). Together with the
 * PID it identifies one process: a reused PID has a different start time. Undefined elsewhere.
 */
export function processStartTicks(pid: number): string | undefined {
  if (process.platform !== 'linux') return undefined;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // `comm` (field 2) may contain spaces and parentheses; fields after the last ')' are fixed.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return /^\d+$/.test(fields[19] ?? '') ? fields[19] : undefined;
  } catch { return undefined; }
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (probe) { return (probe as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

/**
 * R-23: an owner is dead when its PID is gone, when the PID now belongs to another process (Linux start
 * time differs), or when a lock that promised a heartbeat has not been touched for `staleMs` (covers
 * Windows, where the start time is not cheaply available). Locks written by older TCG versions carry no
 * heartbeat promise and keep the PID-only rule, so a live older process is never robbed of its lock.
 */
function ownerIsDead(path: string, owner: { pid: number; startTicks?: unknown; heartbeat?: unknown }, staleMs: number): boolean {
  if (!alive(owner.pid)) return true;
  if (typeof owner.startTicks === 'string') {
    const current = processStartTicks(owner.pid);
    if (current !== undefined && current !== owner.startTicks) return true;
  }
  if (owner.heartbeat === true) {
    try { return Date.now() - statSync(path).mtimeMs > staleMs; } catch { return false; }
  }
  return false;
}

/** Exclusive local-process ownership, including guarded recovery of a dead owner. */
export function acquireLockSync(path: string, options: LockOptions = {}): () => void {
  mkdirSync(dirname(path), { recursive: true });
  const token = randomUUID();
  const staleMs = options.staleMs ?? LOCK_STALE_MS;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = openSync(path, 'wx');
      try {
        writeFileSync(file, JSON.stringify({
          pid: process.pid, token, createdAt: new Date().toISOString(),
          startTicks: processStartTicks(process.pid), heartbeat: true,
        }));
      } finally { closeSync(file); }
      // Touch only the mtime: rewriting content could expose a half-written JSON to a concurrent reader.
      const beat = setInterval(() => {
        try { const now = new Date(); utimesSync(path, now, now); } catch { /* released or removed */ }
      }, options.heartbeatMs ?? LOCK_HEARTBEAT_MS);
      beat.unref();
      return () => {
        clearInterval(beat);
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
        let owner: { pid: number; startTicks?: unknown; heartbeat?: unknown };
        try { owner = JSON.parse(readFileSync(path, 'utf8')); }
        catch (readError) {
          if ((readError as NodeJS.ErrnoException).code === 'ENOENT' && attempt === 0) continue;
          throw new OperationError('LOCKED', `Unrecognized operation lock: ${resolve(path)}`);
        }
        if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new OperationError('LOCKED', `Invalid lock owner: ${path}`);
        if (attempt === 0 && owner.pid !== process.pid && ownerIsDead(path, owner, staleMs)) { unlinkSync(path); continue; }
        throw new OperationError('LOCKED', `Another operation (PID ${owner.pid}) owns ${path}`);
      } finally { closeSync(recovery); unlinkSync(`${path}.recovery`); }
    }
  }
  throw new OperationError('LOCKED', `Could not acquire ${path}`);
}

export async function acquireLock(path: string, options?: LockOptions): Promise<() => Promise<void>> {
  const release = acquireLockSync(path, options);
  return async () => release();
}
