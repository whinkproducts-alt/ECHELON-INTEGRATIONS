/**
 * Command policy and sandbox settings (backlog item 58, rules R2 and R14).
 * classifyCommand: Class B only for an owner-set allow-list of read-only programs run with plain arguments; everything
 * else is Class C. sandboxDockerArgs: the fixed, hardened `docker run` arguments a command runs under. Nothing here runs
 * a command. Whatever runs commands later must call classifyCommand, then the permission engine, then use these arguments.
 */
export type CommandClass = 'B' | 'C';

/** Read-only programs Victor may allow. The default list is empty: nothing is Class B until he sets it. */
export type CommandAllowList = readonly string[];

// Anything a shell, a redirect, a substitution or a program flag could use to run or write something else.
const UNSAFE = /[;&|<>`$(){}\\\n\r*?!~]|^-.*(exec|eval|output|write|delete)/i;
const READ_ONLY_FLAGS_BLOCKED = new Set(['-delete', '-exec', '-execdir', '-ok', '-fprint', '-o', '--output', '-i', '--in-place']);

export function classifyCommand(argv: readonly string[], allow: CommandAllowList): { class: CommandClass; reason: string } {
  const [program, ...args] = argv;
  if (!program || program.includes('/')) return { class: 'C', reason: 'program must be a bare name' };
  if (!allow.includes(program)) return { class: 'C', reason: 'not on the allow-list' };
  for (const a of args) {
    if (UNSAFE.test(a) || READ_ONLY_FLAGS_BLOCKED.has(a)) return { class: 'C', reason: 'argument not plain' };
  }
  return { class: 'B', reason: 'allow-listed read-only program with plain arguments' };
}

export interface SandboxOptions { image: string; workspace?: string; workspaceAccess?: 'none' | 'ro' | 'rw'; network?: boolean; memory?: string; pids?: number; timeoutSec?: number }

/** Fixed hardening. `workspaceAccess` defaults to none; `rw` and `network` must be asked for explicitly. */
export function sandboxDockerArgs(o: SandboxOptions, argv: readonly string[]): string[] {
  const access = o.workspaceAccess ?? 'none';
  if (access !== 'none' && !o.workspace) throw new Error('workspace path required for workspace access');
  if (o.workspace && /[:,\s]/.test(o.workspace)) throw new Error('workspace path may not contain : , or spaces');
  if (!/^[a-z0-9][a-z0-9._/:@-]*$/i.test(o.image)) throw new Error('invalid image name');
  return [
    'run', '--rm', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--network', o.network ? 'bridge' : 'none',
    '--memory', o.memory ?? '256m', '--pids-limit', String(o.pids ?? 64), '--user', '65534:65534',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
    ...(access === 'none' ? [] : ['-v', `${o.workspace}:/workspace:${access}`, '-w', '/workspace']),
    o.image, ...argv,
  ];
}

/** Plain-language settings, like OpenClaw's `sandbox explain`, for the owner to read. */
export function explainSandbox(o: SandboxOptions): string[] {
  return [
    `image: ${o.image}`,
    `network: ${o.network ? 'on (bridge)' : 'off'}`,
    `workspace: ${o.workspaceAccess ?? 'none'}${o.workspace ? ` at ${o.workspace}` : ''}`,
    `limits: ${o.memory ?? '256m'} memory, ${o.pids ?? 64} processes, ${o.timeoutSec ?? 30}s`,
    'root filesystem read-only, all capabilities dropped, no privilege gain, runs as an unprivileged user',
  ];
}
