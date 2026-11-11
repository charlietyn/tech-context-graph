import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { acquireLockSync, processStartTicks } from '../src/services/operation-lock';

/**
 * R-23: a lock whose PID was reused by another live process must be recoverable, without ever taking
 * the lock from a live owner. process.ppid is a live process that is not the lock owner.
 */
describe('R-23 lock ownership beyond the PID', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(resolve(tmpdir(), 'tcg-lock-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const write = (path: string, owner: Record<string, unknown>, ageMs = 0) => {
    writeFileSync(path, JSON.stringify({ token: 'other', createdAt: new Date().toISOString(), ...owner }));
    const when = new Date(Date.now() - ageMs);
    utimesSync(path, when, when);
  };

  it('records PID, start identity and a heartbeat promise, and releases cleanly', () => {
    const path = resolve(dir, 'a.lock');
    const release = acquireLockSync(path);
    const owner = JSON.parse(readFileSync(path, 'utf8'));
    expect(owner).toMatchObject({ pid: process.pid, heartbeat: true });
    if (process.platform === 'linux') expect(owner.startTicks).toBe(processStartTicks(process.pid));
    release();
    expect(() => statSync(path)).toThrow();
  });

  (process.platform === 'linux' ? it : it.skip)('Linux: a live PID with another start time is a reused PID, so the lock is recovered', () => {
    const path = resolve(dir, 'reused.lock');
    write(path, { pid: process.ppid, startTicks: '1', heartbeat: true });
    const release = acquireLockSync(path);
    expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(process.pid);
    release();
  });

  it('never takes a lock from a live owner with matching identity and a fresh heartbeat', () => {
    const path = resolve(dir, 'live.lock');
    write(path, { pid: process.ppid, startTicks: processStartTicks(process.ppid), heartbeat: true });
    expect(() => acquireLockSync(path)).toThrow(/owns/);
  });

  it('recovers a heartbeat lock untouched for longer than the stale window (all platforms, incl. Windows)', () => {
    const path = resolve(dir, 'stale.lock');
    write(path, { pid: process.ppid, heartbeat: true }, 60_000);
    expect(() => acquireLockSync(path, { staleMs: 120_000 })).toThrow(/owns/);
    const release = acquireLockSync(path, { staleMs: 30_000 });
    expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(process.pid);
    release();
  });

  it('keeps the PID-only rule for locks written by older TCG versions (no heartbeat promise)', () => {
    const path = resolve(dir, 'legacy.lock');
    write(path, { pid: process.ppid }, 24 * 60 * 60_000);
    expect(() => acquireLockSync(path, { staleMs: 1 })).toThrow(/owns/);
  });

  it('the owner keeps its heartbeat fresh while it holds the lock', async () => {
    const path = resolve(dir, 'beat.lock');
    const release = acquireLockSync(path, { heartbeatMs: 20 });
    const old = new Date(Date.now() - 60_000);
    utimesSync(path, old, old);
    await new Promise((done) => setTimeout(done, 150));
    expect(Date.now() - statSync(path).mtimeMs).toBeLessThan(5_000);
    release();
  });
});
