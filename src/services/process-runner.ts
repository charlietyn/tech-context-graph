import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export class OperationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export interface ProcessOptions {
  cwd?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  onLine?: (line: string) => void;
  input?: string;
}

/** Resolves only after the child has closed, including cancellation and timeout. */
export async function runProcess(command: string, args: string[], options: ProcessOptions = {}): Promise<{
  exitCode: number | null; stdout: string; stderr: string; durationMs: number;
}> {
  if (options.signal?.aborted) throw new OperationError('CANCELLED', 'Operation cancelled.');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd, env: options.env ?? process.env, shell: false, windowsHide: true,
      detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    let failure: Error | undefined;
    let stdout = ''; let stderr = '';
    const kill = () => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => child.kill());
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      }
    };
    const cancel = () => { failure ??= new OperationError('CANCELLED', `${command} cancelled.`); kill(); };
    const timer = setTimeout(() => {
      failure ??= new OperationError('TIMEOUT', `${command} exceeded ${options.timeoutMs ?? 120_000} ms.`); kill();
    }, options.timeoutMs ?? 120_000);
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (!options.signal) { process.once('SIGINT', cancel); process.once('SIGTERM', cancel); }
    if (options.signal?.aborted) cancel();
    const decoders = [new StringDecoder('utf8'), new StringDecoder('utf8')];
    const pending = ['', ''];
    const consume = (index: number, value: string) => {
      if (index === 0) stdout += value; else stderr += value;
      if (stdout.length + stderr.length > 64 * 1024 * 1024) {
        failure ??= new OperationError('OUTPUT_LIMIT', `${command} output exceeded 64 MiB.`); kill();
      }
      pending[index] += value;
      const lines = pending[index].split(/\r\n|\n|\r/);
      pending[index] = lines.pop() ?? '';
      for (const line of lines) if (line) {
        try { options.onLine?.(line); } catch (error) { failure ??= error as Error; kill(); }
      }
    };
    child.stdout.on('data', (chunk: Buffer) => consume(0, decoders[0].write(chunk)));
    child.stderr.on('data', (chunk: Buffer) => consume(1, decoders[1].write(chunk)));
    child.stdin.on('error', () => { /* Child may exit before reading stdin. */ });
    child.stdin.end(options.input);
    child.on('error', (error) => { failure ??= new OperationError('PROCESS_START', `${command}: ${error.message}`); });
    child.on('close', (exitCode) => {
      clearTimeout(timer); options.signal?.removeEventListener('abort', cancel);
      if (!options.signal) { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
      for (let i = 0; i < 2; i++) {
        consume(i, decoders[i].end());
        if (pending[i]) { try { options.onLine?.(pending[i]); } catch (error) { failure ??= error as Error; } }
      }
      if (failure) reject(failure);
      else resolve({ exitCode, stdout, stderr, durationMs: Date.now() - started });
    });
  });
}
