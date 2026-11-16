/**
 * Local and Docker command backend (item 68). Order is fixed: classifyCommand, then the gate (permission engine or an
 * approval id), then sandboxDockerArgs for Docker, then runProcess. Output comes back wrapped as untrusted data.
 */
import { classifyCommand, sandboxDockerArgs, type CommandAllowList, type SandboxOptions } from '@/lib/exec-policy';
import { gate, ledgerRun, type GateInput, type GateResult } from '@/lib/exec-gate';
import { runProcess } from '@/lib/exec-runner';
import { wrapUntrustedContent, stripFakeUntrustedTags } from '@/lib/content-isolation';

export const EXEC_MAX_TIMEOUT_SEC = 120;
export type Backend = 'local' | 'docker';
export interface CommandRequest {
  userId: string; argv: readonly string[]; backend: Backend; allow: CommandAllowList;
  sandbox?: SandboxOptions; timeoutSec?: number; approvalId?: string; correlationId?: string;
}
export type CommandResult = GateResult | { ok: true; code: number | null; timedOut: boolean; output: string };

export async function runCommand(r: CommandRequest): Promise<CommandResult> {
  if (r.argv.length === 0 || r.argv.some((a) => typeof a !== 'string' || a.includes('\0'))) return { ok: false, needsApproval: false, reason: 'invalid command' };
  if (r.backend === 'docker' && !r.sandbox) return { ok: false, needsApproval: false, reason: 'docker backend needs sandbox options' };
  const timeoutSec = Math.min(Math.max(r.timeoutSec ?? r.sandbox?.timeoutSec ?? 30, 1), EXEC_MAX_TIMEOUT_SEC);
  const cls = classifyCommand(r.argv, r.allow).class;
  const capability = r.backend === 'docker' ? 'exec_command_docker' : 'exec_command_local';
  const params = { argv: r.argv, backend: r.backend, sandbox: r.sandbox ?? null, timeoutSec };
  const gi: GateInput = { userId: r.userId, capability, cls, params, approvalId: r.approvalId, correlationId: r.correlationId, summary: `${r.backend}: ${r.argv.join(' ')}` };
  const g = await gate(gi);
  if (!g.ok) return g;
  let res;
  try {
    // shortcut: killing the docker CLI on timeout may leave the container to its own limits (--rm, memory, pids); add --name + docker kill when needed.
    res = r.backend === 'docker'
      ? await runProcess('docker', sandboxDockerArgs(r.sandbox!, r.argv), { timeoutMs: timeoutSec * 1000 })
      : await runProcess(r.argv[0], r.argv.slice(1), { timeoutMs: timeoutSec * 1000 });
  } catch (e) {
    await ledgerRun(gi, 'FAILED', e instanceof Error ? e.message : 'error');
    return { ok: false, needsApproval: false, reason: e instanceof Error ? e.message : 'error' };
  }
  await ledgerRun(gi, res.code === 0 ? 'EXECUTED' : 'FAILED', `exit ${res.code}${res.timedOut ? ' timed out' : ''}`);
  const text = stripFakeUntrustedTags(res.stdout + (res.stderr ? `\n[stderr]\n${res.stderr}` : ''));
  return { ok: true, code: res.code, timedOut: res.timedOut, output: wrapUntrustedContent(text, 'command_output', r.argv[0]) };
}
