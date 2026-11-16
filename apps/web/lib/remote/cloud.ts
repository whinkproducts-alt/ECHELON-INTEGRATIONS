/**
 * Cloud sandboxes (Modal, Daytona, Vercel), item 50. Every run is Class C. The approval card names what leaves the machine,
 * the run has a hard timeout and a cost cap checked BEFORE it starts, and the credential comes only from encrypted settings.
 * Provider adapters are injected; none ships yet (their APIs need a live account to verify, see docs/lanes/h-notes.md).
 */
import { gate, ledgerRun, type GateInput, type GateResult } from '@/lib/exec-gate';
import { isLocalOnlyMode } from '@/lib/local-only';
import { wrapUntrustedContent, stripFakeUntrustedTags } from '@/lib/content-isolation';
import { prisma } from '@/lib/db';
import { decryptKey } from '@/lib/key-encryption';

export type CloudProvider = 'modal' | 'daytona' | 'vercel';
export interface CloudAdapter {
  estimateCostUsd(timeoutSec: number): number;
  run(input: { command: string; files: readonly string[]; credential: string; timeoutSec: number; signal: AbortSignal }): Promise<{ code: number; output: string; costUsd: number }>;
}
export interface CloudRequest {
  userId: string; provider: CloudProvider; command: string; files?: readonly string[]; timeoutSec: number; maxCostUsd: number;
  adapter: CloudAdapter | undefined; approvalId?: string; correlationId?: string;
  getCredential?: (userId: string, provider: CloudProvider) => Promise<string | null>;
}
export const CLOUD_MAX_TIMEOUT_SEC = 600;

export async function credentialFromSettings(userId: string, provider: CloudProvider): Promise<string | null> {
  const row = await prisma.userApiKey.findUnique({ where: { userId_provider: { userId, provider: `sandbox:${provider}` } } });
  return row ? decryptKey(row.encryptedKey) : null;
}
/** What the approval card shows: exactly what leaves this machine. */
export function describeEgress(r: Pick<CloudRequest, 'provider' | 'command' | 'files' | 'timeoutSec' | 'maxCostUsd'>): string {
  const files = r.files?.length ? `files: ${r.files.join(', ')}` : 'no files';
  return `Sends this command and ${files} to ${r.provider} (a third party): "${r.command}". Limit ${r.timeoutSec}s, cost cap $${r.maxCostUsd}. Output returns to you.`;
}

export async function runCloud(r: CloudRequest): Promise<GateResult | { ok: true; code: number; output: string; costUsd: number }> {
  const no = (reason: string): GateResult => ({ ok: false, needsApproval: false, reason });
  if (isLocalOnlyMode()) return no('Cloud sandboxes are not available in Local-Only mode');
  if (!r.adapter) return no(`${r.provider} is not connected`);
  if (!(r.timeoutSec > 0 && r.timeoutSec <= CLOUD_MAX_TIMEOUT_SEC)) return no(`timeout must be 1 to ${CLOUD_MAX_TIMEOUT_SEC} seconds`);
  if (!(r.maxCostUsd > 0)) return no('a cost cap is required');
  if (r.adapter.estimateCostUsd(r.timeoutSec) > r.maxCostUsd) return no('worst-case cost is above the cost cap');
  const gi: GateInput = { userId: r.userId, capability: 'remote_cloud_sandbox', cls: 'C', correlationId: r.correlationId, approvalId: r.approvalId,
    params: { provider: r.provider, command: r.command, files: r.files ?? [], timeoutSec: r.timeoutSec, maxCostUsd: r.maxCostUsd }, summary: describeEgress(r) };
  const g = await gate(gi);
  if (!g.ok) return g;
  const credential = await (r.getCredential ?? credentialFromSettings)(r.userId, r.provider);
  if (!credential) { await ledgerRun(gi, 'FAILED', 'no credential in settings'); return no('no credential saved in settings'); }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), r.timeoutSec * 1000);
  try {
    const res = await Promise.race([
      r.adapter.run({ command: r.command, files: r.files ?? [], credential, timeoutSec: r.timeoutSec, signal: ac.signal }),
      new Promise<never>((_, rej) => ac.signal.addEventListener('abort', () => rej(new Error('timed out')))),
    ]);
    if (res.costUsd > r.maxCostUsd) { await ledgerRun(gi, 'FAILED', `cost ${res.costUsd} over cap`); return no('run cost exceeded the cap; result withheld'); }
    await ledgerRun(gi, res.code === 0 ? 'EXECUTED' : 'FAILED', `exit ${res.code} cost $${res.costUsd}`);
    return { ok: true, code: res.code, costUsd: res.costUsd, output: wrapUntrustedContent(stripFakeUntrustedTags(res.output.slice(0, 64 * 1024)), 'cloud_sandbox_output', r.provider) };
  } catch (e) {
    await ledgerRun(gi, 'FAILED', e instanceof Error ? e.message : 'error');
    return no(e instanceof Error ? e.message : 'error');
  } finally { clearTimeout(timer); }
}
