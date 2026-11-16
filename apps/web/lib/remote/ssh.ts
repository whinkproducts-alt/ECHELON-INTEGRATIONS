/** SSH to Victor's own machines (they count as local). Key file auth only; no passwords stored or typed. */
import { classifyCommand, type CommandAllowList } from '@/lib/exec-policy';
import { gate, ledgerRun, type GateInput, type GateResult } from '@/lib/exec-gate';
import { runProcess } from '@/lib/exec-runner';
import { wrapUntrustedContent, stripFakeUntrustedTags } from '@/lib/content-isolation';

export interface OwnHost { name: string; host: string; user: string; port?: number; keyFile?: string }
export interface SshRequest { userId: string; hostName: string; hosts: readonly OwnHost[]; argv: readonly string[]; allow: CommandAllowList; timeoutSec?: number; approvalId?: string; correlationId?: string }
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function sshArgs(h: OwnHost, command: string): string[] {
  if (!SAFE.test(h.host) || !SAFE.test(h.user)) throw new Error('invalid host or user');
  if (h.port !== undefined && !(Number.isInteger(h.port) && h.port > 0 && h.port < 65536)) throw new Error('invalid port');
  if (h.keyFile && (!h.keyFile.startsWith('/') || /[\0\n]/.test(h.keyFile))) throw new Error('invalid key file');
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes', '-o', 'ClearAllForwardings=yes', '-T',
    ...(h.port ? ['-p', String(h.port)] : []), ...(h.keyFile ? ['-i', h.keyFile, '-o', 'IdentitiesOnly=yes'] : []), `${h.user}@${h.host}`, '--', command];
}

export async function runSsh(r: SshRequest): Promise<GateResult | { ok: true; code: number | null; timedOut: boolean; output: string }> {
  const h = r.hosts.find((x) => x.name === r.hostName);
  if (!h) return { ok: false, needsApproval: false, reason: 'not one of your registered machines' };
  if (r.argv.length === 0) return { ok: false, needsApproval: false, reason: 'invalid command' };
  const timeoutSec = Math.min(Math.max(r.timeoutSec ?? 30, 1), 120);
  const cls = classifyCommand(r.argv, r.allow).class; // plain allow-listed args only: the remote shell sees one string
  const gi: GateInput = { userId: r.userId, capability: 'remote_ssh', cls, correlationId: r.correlationId, approvalId: r.approvalId,
    params: { host: h.name, argv: r.argv, timeoutSec }, summary: `ssh ${h.user}@${h.host}: ${r.argv.join(' ')}` };
  const g = await gate(gi);
  if (!g.ok) return g;
  try {
    const res = await runProcess('ssh', sshArgs(h, r.argv.join(' ')), { timeoutMs: timeoutSec * 1000 });
    await ledgerRun(gi, res.code === 0 ? 'EXECUTED' : 'FAILED', `exit ${res.code}${res.timedOut ? ' timed out' : ''}`);
    return { ok: true, code: res.code, timedOut: res.timedOut, output: wrapUntrustedContent(stripFakeUntrustedTags(res.stdout + res.stderr), 'ssh_output', h.host) };
  } catch (e) {
    await ledgerRun(gi, 'FAILED', e instanceof Error ? e.message : 'error');
    return { ok: false, needsApproval: false, reason: e instanceof Error ? e.message : 'error' };
  }
}
