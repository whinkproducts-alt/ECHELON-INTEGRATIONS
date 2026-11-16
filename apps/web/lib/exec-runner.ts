/**
 * The ONLY place (with the read-only git tool) that starts a process. Item 68: callers reach it through exec-backend or
 * remote/ssh, which classify, gate and ledger first. execFile only: no shell, hard timeout, capped output, minimal env.
 */
import { execFile } from 'node:child_process';

export interface RunResult { code: number | null; stdout: string; stderr: string; timedOut: boolean }
export interface RunOptions { timeoutMs: number; maxBytes?: number; cwd?: string; stdin?: string }

export function runProcess(file: string, args: readonly string[], o: RunOptions): Promise<RunResult> {
  const cap = o.maxBytes ?? 64 * 1024;
  return new Promise((resolve) => {
    const child = execFile(file, [...args], {
      timeout: o.timeoutMs, maxBuffer: cap, cwd: o.cwd, killSignal: 'SIGKILL', shell: false, windowsHide: true,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' } as unknown as NodeJS.ProcessEnv, // no inherited secrets
    }, (err: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
      resolve({
        code: e ? (typeof e.code === 'number' ? e.code : null) : 0,
        stdout: String(stdout).slice(0, cap), stderr: String(stderr).slice(0, cap) || (e && typeof e.code === 'string' ? e.code : ''),
        timedOut: Boolean(e?.killed),
      });
    });
    if (o.stdin !== undefined) child.stdin?.end(o.stdin); else child.stdin?.end();
  });
}
