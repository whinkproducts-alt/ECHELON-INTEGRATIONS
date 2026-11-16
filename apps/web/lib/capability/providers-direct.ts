/**
 * Direct external tools: search (Exa, Parallel, Firecrawl), Reddit public feeds, FAL.ai images,
 * Hyperliquid READ-ONLY market data. Each tool is a fixed table row: one host, one method, validated
 * arguments, a key from the server environment only.
 *
 * Rules held here (CLAUDE.md): every outcome is ledgered (6 / 5); every result is untrusted external
 * content, stripped, injection-scanned, capped and wrapped before it can reach a model (6); every tool
 * defaults to Class C, and only the WHINK-side TOOLS table below can make one Class A (4); paid calls
 * pass model-router admission (R15 envelope) before any byte leaves (10); Local-Only and lockdown refuse
 * everything. Hyperliquid trading, transfers and withdrawals are NOT built and no /exchange path exists:
 * money is protected and needs Victor's approval by request id.
 */
import { createHash, randomBytes } from 'node:crypto';
import { logger } from '@/lib/logger';
import { recordAction, updateActionStatus } from '@/lib/ledger';
import { checkApprovedAction, checkPermission } from '@/lib/permission-engine';
import { createApproval } from '@/lib/approvals';
import { approvalContentHash } from '@/lib/canonical-json';
import { isLocalOnlyMode } from '@/lib/local-only';
import { isLockedDown } from '@/lib/safety/lockdown';
import { createAllowlistedFetch } from '@/lib/capability/egress';
import { filterToolResult, scanForInjectionPatterns, stripFakeUntrustedTags, wrapUntrustedContent } from '@/lib/content-isolation';
import { holdDispatch, releaseDispatch, reserveDispatch, settleDispatch } from '@/lib/model-router/admission';

export const DIRECT_TOOL_PREFIX = 'ext_';
export const isDirectTool = (name: string) => Object.prototype.hasOwnProperty.call(TOOLS, name);
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_OUTPUT_CHARS = 8000;

type Args = Record<string, unknown>;
interface Built { url: string; method: 'GET' | 'POST'; headers: Record<string, string>; body?: string }
interface DirectTool {
  host: string;
  /** WHINK-side class. Anything not listed A here is C. */
  cls: 'A' | 'C';
  /** metered tools need a known price (env) and pass admission; free ones never leave anything but a read. */
  cost: 'free' | 'metered';
  priceEnv?: string;
  keyEnv?: string;
  build(args: Args, key: string): Built;
}

const str = (v: unknown, name: string, max = 500): string => {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new DirectToolError('VAL_INPUT_INVALID', `${name} must be a non-empty string up to ${max} characters`);
  return v.trim();
};
const int = (v: unknown, def: number, lo: number, hi: number): number => {
  if (v === undefined) return def;
  if (!Number.isInteger(v) || (v as number) < lo || (v as number) > hi) throw new DirectToolError('VAL_INPUT_INVALID', `number must be an integer from ${lo} to ${hi}`);
  return v as number;
};
const json = (b: unknown) => JSON.stringify(b);

/** Image models a call may name. A model id outside this list is refused, so a prompt cannot pick a pricier model. */
export const FAL_MODELS = ['fal-ai/flux/schnell'] as const;
/** Hyperliquid info request types: read-only market data. No account, order or transfer type exists here. */
export const HYPERLIQUID_READ_TYPES = ['allMids', 'meta', 'l2Book', 'metaAndAssetCtxs'] as const;

export const TOOLS: Record<string, DirectTool> = {
  ext_exa_search: {
    host: 'api.exa.ai', cls: 'C', cost: 'metered', priceEnv: 'WHINK_EXA_MICROS_PER_CALL', keyEnv: 'EXA_API_KEY',
    build: (a, key) => ({ url: 'https://api.exa.ai/search', method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: json({ query: str(a.query, 'query'), numResults: int(a.numResults, 5, 1, 10) }) }),
  },
  // Parallel and Firecrawl request shapes follow their public docs from memory; only mocked HTTP is tested. Verify on first live key.
  ext_parallel_search: {
    host: 'api.parallel.ai', cls: 'C', cost: 'metered', priceEnv: 'WHINK_PARALLEL_MICROS_PER_CALL', keyEnv: 'PARALLEL_API_KEY',
    build: (a, key) => ({ url: 'https://api.parallel.ai/v1beta/search', method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: json({ objective: str(a.query, 'query'), max_results: int(a.numResults, 5, 1, 10) }) }),
  },
  ext_firecrawl_search: {
    host: 'api.firecrawl.dev', cls: 'C', cost: 'metered', priceEnv: 'WHINK_FIRECRAWL_MICROS_PER_CALL', keyEnv: 'FIRECRAWL_API_KEY',
    build: (a, key) => ({ url: 'https://api.firecrawl.dev/v1/search', method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: json({ query: str(a.query, 'query'), limit: int(a.numResults, 5, 1, 10) }) }),
  },
  ext_reddit_read: {
    host: 'www.reddit.com', cls: 'A', cost: 'free',
    build: (a) => {
      const sub = str(a.subreddit, 'subreddit', 21);
      if (!/^[A-Za-z0-9_]{2,21}$/.test(sub)) throw new DirectToolError('VAL_INPUT_INVALID', 'subreddit name is invalid');
      const sort = a.sort === undefined ? 'hot' : a.sort;
      if (!['hot', 'new', 'top', 'rising'].includes(sort as string)) throw new DirectToolError('VAL_INPUT_INVALID', 'sort must be hot, new, top or rising');
      return { url: `https://www.reddit.com/r/${sub}/${sort}.json?limit=${int(a.limit, 10, 1, 25)}&raw_json=1`, method: 'GET', headers: { 'user-agent': 'echelon-readonly/1.0' } };
    },
  },
  ext_fal_image: {
    host: 'fal.run', cls: 'C', cost: 'metered', priceEnv: 'WHINK_FAL_MICROS_PER_IMAGE', keyEnv: 'FAL_KEY',
    build: (a, key) => {
      const model = a.model === undefined ? FAL_MODELS[0] : a.model;
      if (!(FAL_MODELS as readonly unknown[]).includes(model)) throw new DirectToolError('VAL_INPUT_INVALID', `model must be one of ${FAL_MODELS.join(', ')}`);
      return { url: `https://fal.run/${model}`, method: 'POST', headers: { authorization: `Key ${key}`, 'content-type': 'application/json' }, body: json({ prompt: str(a.prompt, 'prompt', 1000), num_images: 1 }) };
    },
  },
  ext_hyperliquid_info: {
    host: 'api.hyperliquid.xyz', cls: 'A', cost: 'free',
    build: (a) => {
      const type = a.type;
      if (!(HYPERLIQUID_READ_TYPES as readonly unknown[]).includes(type)) throw new DirectToolError('VAL_INPUT_INVALID', `type must be one of ${HYPERLIQUID_READ_TYPES.join(', ')} (read-only market data)`);
      const body: Args = { type };
      if (type === 'l2Book') body.coin = str(a.coin, 'coin', 20);
      if (typeof body.coin === 'string' && !/^[A-Za-z0-9:@_-]{1,20}$/.test(body.coin)) throw new DirectToolError('VAL_INPUT_INVALID', 'coin is invalid');
      return { url: 'https://api.hyperliquid.xyz/info', method: 'POST', headers: { 'content-type': 'application/json' }, body: json(body) };
    },
  },
};

export class DirectToolError extends Error {
  constructor(readonly code: string, message: string, readonly actionId?: string) { super(message); this.name = 'DirectToolError'; }
}

export interface DirectParams { userId: string; toolName: string; args: Args; correlationId?: string; persona?: string }
export interface DirectDeps { fetch?: typeof fetch; env?: NodeJS.ProcessEnv }
export interface DirectApproved { approvalId: string; contentHash: string }
export type DirectResult =
  | { status: 'EXECUTED'; output: string; actionId: string; untrusted: true }
  | { status: 'AWAITING_APPROVAL'; approvalId: string; actionId: string; reason: string };

/** Key names, size and hash only: arguments (prompts, queries) never sit in the ledger. */
function summarise(v: unknown): string {
  const s = JSON.stringify(v) ?? '';
  return JSON.stringify({ keys: v && typeof v === 'object' ? Object.keys(v as object).slice(0, 20) : [], bytes: s.length, sha256: createHash('sha256').update(s).digest('hex') });
}

/** Strip fake envelope tags, scan for injection, normalise, cap, wrap. A suspicious result is dropped, not shown. */
export function wrapDirectResult(raw: string, toolName: string, host: string): { text: string; blocked: string[] } {
  const stripped = stripFakeUntrustedTags(raw);
  const scan = scanForInjectionPatterns(stripped);
  if (scan.suspicious) return { text: wrapUntrustedContent('[result withheld: it contained instruction-like text]', toolName, `https://${host}`), blocked: scan.patterns };
  return { text: wrapUntrustedContent(filterToolResult(stripped).slice(0, MAX_OUTPUT_CHARS), toolName, `https://${host}`), blocked: [] };
}

export async function runDirectTool(p: DirectParams, deps: DirectDeps = {}, approved?: DirectApproved): Promise<DirectResult> {
  const env = deps.env ?? process.env;
  const cid = p.correlationId ?? `ext-${randomBytes(8).toString('hex')}`;
  const base = { userId: p.userId, initiator: 'user' as const, persona: p.persona ?? 'WHINK', tool: p.toolName, correlationId: cid };
  const tool = isDirectTool(p.toolName) ? TOOLS[p.toolName] : undefined;
  const deny = async (code: string, reason: string, status: 'DENIED' | 'FAILED' = 'DENIED'): Promise<never> => {
    let actionId: string | undefined;
    try { actionId = (await recordAction({ ...base, action: 'external_tool_denied', permissionClass: tool?.cls ?? 'C', status, inputSummary: summarise(p.args), outputSummary: reason.slice(0, 300), errorCode: code, approvalId: approved?.approvalId })).id; }
    catch (e) { logger.error('external tool denial could not be ledgered', { error: (e as Error)?.message }); }
    throw new DirectToolError(code, reason, actionId);
  };

  if (!tool) return deny('RES_NOT_FOUND', 'unknown tool');
  if (await isLockedDown(p.userId)) return deny('AUTHZ_POLICY_DENIED', 'Lockdown is active');
  if (isLocalOnlyMode(env)) return deny('LOCAL_ONLY', 'Not available in Local-Only mode');
  const key = tool.keyEnv ? env[tool.keyEnv]?.trim() ?? '' : '';
  if (tool.keyEnv && !key) return deny('NOT_CONFIGURED', `${tool.keyEnv} is not set`);
  let req: Built;
  try { req = tool.build(p.args, key); } catch (e) { return deny(e instanceof DirectToolError ? e.code : 'VAL_INPUT_INVALID', (e as Error).message); }

  let method = 'auto';
  if (approved) {
    const perm = await checkApprovedAction(p.userId, approved.approvalId, p.toolName, approved.contentHash);
    if (!perm.allowed) return deny('AUTHZ_POLICY_DENIED', perm.reason ?? 'approval not valid');
    method = 'human_approved';
  } else {
    const perm = await checkPermission(p.userId, p.toolName, tool.cls, cid, { params: p.args });
    if (!perm.allowed) {
      const approval = await createApproval({ userId: p.userId, kind: 'tool_call', tool: p.toolName, params: { args: p.args }, persona: base.persona, correlationId: cid, summary: `Run ${p.toolName} on ${tool.host}${tool.cost === 'metered' ? ' (paid call)' : ''}`.slice(0, 300) });
      const row = await recordAction({ ...base, action: 'external_tool_awaiting_approval', permissionClass: 'C', status: 'AWAITING_APPROVAL', inputSummary: summarise(p.args), outputSummary: (perm.reason ?? 'approval required').slice(0, 300), approvalId: approval.id });
      return { status: 'AWAITING_APPROVAL', approvalId: approval.id, actionId: row.id, reason: perm.reason ?? 'approval required' };
    }
    method = perm.method;
  }

  // Paid calls: admission (lockdown, Local-Only, known price, spend cap) before anything leaves.
  let hold: string | null = null;
  if (tool.cost === 'metered') {
    const micros = Number.parseInt(env[tool.priceEnv!] ?? '', 10);
    const priceKnown = Number.isSafeInteger(micros) && micros >= 0;
    try {
      hold = (await reserveDispatch({ userId: p.userId, purpose: 'other', correlationId: cid, model: p.toolName, provider: tool.host.slice(0, 40), maxTokens: 1, inputChars: 0, reservedTokens: 1, reservedMicros: priceKnown ? micros : 0, priceKnown, costClass: 'metered', kind: 'other' })).attemptKey;
    } catch (e) { return deny('ADMISSION_DENIED', `Paid call refused: ${(e as { code?: string }).code ?? 'admission'}`); }
  }

  const receipt = await recordAction({ ...base, action: 'external_tool_invoke', permissionClass: tool.cls, status: 'SUBMITTED', confirmationMethod: method, inputSummary: summarise(p.args), approvalId: approved?.approvalId, protectedCategory: undefined });
  const started = Date.now();
  try {
    const f = deps.fetch ?? createAllowlistedFetch({ allowlist: [`${tool.host}:443`], maxResponseBytes: MAX_RESPONSE_BYTES });
    const res = await f(req.url, { method: req.method, headers: req.headers, body: req.body, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new DirectToolError('EXEC_FAILED', `${tool.host} returned ${res.status}`);
    const text = (await res.text()).slice(0, MAX_RESPONSE_BYTES);
    const { text: output, blocked } = wrapDirectResult(text, p.toolName, tool.host);
    if (hold) await settleDispatch({ userId: p.userId, attemptKey: hold, tokensIn: 1, tokensOut: 0, basis: 'estimated' }).catch(() => holdDispatch({ userId: p.userId, attemptKey: hold!, uncertainty: 'settlement_failed' }));
    await updateActionStatus(p.userId, receipt.id, { status: 'EXECUTED', outputSummary: JSON.stringify({ chars: output.length, sha256: createHash('sha256').update(output).digest('hex'), injectionBlocked: blocked }), latencyMs: Date.now() - started });
    if (blocked.length) await recordAction({ ...base, action: 'external_content_blocked', permissionClass: tool.cls, status: 'DENIED', outputSummary: `patterns=${blocked.join(',')}`, errorCode: 'INJECTION_SUSPECTED' }).catch(() => undefined);
    return { status: 'EXECUTED', output, actionId: receipt.id, untrusted: true };
  } catch (e) {
    // The request may have reached the provider: keep the reservation held rather than releasing it.
    if (hold) await holdDispatch({ userId: p.userId, attemptKey: hold, uncertainty: 'transport_unknown' }).catch(() => releaseDispatch({ userId: p.userId, attemptKey: hold!, externalAttemptStarted: false }).catch(() => undefined));
    const msg = e instanceof DirectToolError ? e.message : 'External call could not be made';
    await updateActionStatus(p.userId, receipt.id, { status: 'FAILED', outputSummary: msg, errorCode: e instanceof DirectToolError ? e.code : 'EXEC_FAILED', latencyMs: Date.now() - started }).catch(() => undefined);
    throw new DirectToolError('EXEC_FAILED', msg, receipt.id);
  }
}

/** Called by lib/approvals.ts after the owner's decision on an `ext_` call. */
export async function executeApprovedDirectTool(userId: string, row: { id: string; tool: string; params: unknown; contentHash: string; correlationId: string; persona: string }, deps: DirectDeps = {}): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const args = (row.params as { args?: Args } | null)?.args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { success: false, error: 'Approval does not describe an external tool call; not run' };
  try { if (approvalContentHash({ kind: 'tool_call', tool: row.tool, params: row.params }) !== row.contentHash) throw new Error('mismatch'); }
  catch { return { success: false, error: 'Approved content no longer matches; not run' }; }
  try {
    const res = await runDirectTool({ userId, toolName: row.tool, args, correlationId: row.correlationId, persona: row.persona }, deps, { approvalId: row.id, contentHash: row.contentHash });
    if (res.status !== 'EXECUTED') return { success: false, error: 'Approval did not lead to execution' };
    return { success: true, data: { actionId: res.actionId, untrusted: true, output: res.output } };
  } catch (e) { return { success: false, error: e instanceof DirectToolError ? `${e.code}: ${e.message}` : 'Execution failed' }; }
}
