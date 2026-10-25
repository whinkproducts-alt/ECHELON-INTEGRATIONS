/**
 * Approvals — pending Class C tool calls and EARs, decided by id.
 *
 * Invariants:
 * - Every query is scoped by userId.
 * - State changes are atomic conditional updateMany calls; exactly one caller wins.
 * - Class C runs only through permission-engine.checkApprovedAction after the win.
 * - Stored params (never request params) are what runs; the content hash is re-checked.
 * - Every state change is one ledger row (lib/ledger.ts) carrying the approval id.
 */

import { prisma } from '@/lib/db';
import { canUseGatewayTool, isGatewayTool } from '@/lib/gateway-access';
import { logger } from '@/lib/logger';
import { recordAction, recordActionSafe, type LedgerStatus } from '@/lib/ledger';
import { checkApprovedAction, logSecurityEvent } from '@/lib/permission-engine';
import { approvalContentHash } from '@/lib/canonical-json';
import { classifyProtected, type ProtectedCategory } from '@/lib/protected-actions';
import { buildDispatchMessage } from '@/lib/approval-handler';
import type { ExecutionAuthorizationRequest } from '@whink/org-kit';

export const APPROVAL_TTL_MS = 30_000;
/** An approval stuck in EXECUTING this long is failed by the sweeper and never re-run. */
export const EXECUTING_STUCK_MS = 2 * 60_000;
const RESULT_CAP = 4000;

export type ApprovalKind = 'tool_call' | 'ear' | 'autonomy_change' | 'scheduled_post';
export type Clock = () => Date;

export interface ApprovalView {
  id: string;
  kind: ApprovalKind;
  tool: string | null;
  summary: string;
  params: Record<string, unknown> | null;
  contentHash: string;
  permissionClass: string;
  /** True for money movement and disclosure of proprietary information. */
  protected: boolean;
  category: ProtectedCategory | null;
  createdAt: string;
  expiresAt: string;
}

export type DecisionStatus = 'EXECUTED' | 'DENIED' | 'EXPIRED' | 'ALREADY_DECIDED' | 'FAILED' | 'NOT_FOUND';

export interface ApprovalResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface DecisionOutcome {
  id: string;
  status: DecisionStatus;
  result: ApprovalResult | null;
}

interface ApprovalRow {
  id: string;
  userId: string;
  kind: string;
  tool: string | null;
  params: unknown;
  contentHash: string;
  summary: string;
  permissionClass: string;
  status: string;
  correlationId: string;
  conversationId: string | null;
  persona: string;
  createdAt: Date;
  expiresAt: Date;
}

const systemClock: Clock = () => new Date();

/** Protected-action metadata for an approval row. Derived from the stored tool, never from a request. */
function protectedOf(row: { kind: string; tool: string | null }): { protected: boolean; category: ProtectedCategory | null } {
  if (row.kind === 'scheduled_post') return { protected: true, category: 'proprietary' };
  if (row.kind !== 'tool_call' || !row.tool) return { protected: false, category: null };
  const c = classifyProtected({ toolName: row.tool, capability: row.tool });
  return { protected: c.protected, category: c.category ?? null };
}

/** Bulk or wildcard ids ("all", "*", lists) are never an approval of anything. */
export function isBulkApprovalId(id: string): boolean {
  const t = id.trim().toLowerCase();
  return t === '' || t === 'all' || t === 'any' || t === 'everything' || t === '*' || /[\s,;*]/.test(t);
}

function toView(r: ApprovalRow): ApprovalView {
  const params = r.params && typeof r.params === 'object' && !Array.isArray(r.params)
    ? (r.params as Record<string, unknown>)
    : null;
  return {
    id: r.id,
    kind: r.kind as ApprovalKind,
    tool: r.tool,
    summary: r.summary,
    params,
    contentHash: r.contentHash,
    permissionClass: r.permissionClass,
    ...protectedOf(r),
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  };
}

function summarise(kind: ApprovalKind, tool: string | null, params: unknown): string {
  if (kind === 'ear') {
    const objective = (params as { objective?: unknown } | null)?.objective;
    return `Authorise team execution: ${typeof objective === 'string' ? objective : 'task'}`.substring(0, 300);
  }
  if (kind === 'scheduled_post') {
    const p = (params ?? {}) as { platform?: unknown; send_at?: unknown; args?: { text?: unknown } };
    return `Schedule ${String(p.platform ?? 'social')} post for ${String(p.send_at ?? '?')}: ${String(p.args?.text ?? '')}`.substring(0, 300);
  }
  let json = '';
  try { json = JSON.stringify(params ?? {}) ?? ''; } catch { json = ''; }
  return `Run ${tool ?? 'tool'} ${json}`.substring(0, 300);
}

function protectedMetaOf(row: { kind?: string; tool: string | null }): { protected?: true; category?: ProtectedCategory } {
  const p = protectedOf({ kind: row.kind ?? 'tool_call', tool: row.tool });
  return p.protected && p.category ? { protected: true, category: p.category } : {};
}

async function ledger(
  row: Pick<ApprovalRow, 'id' | 'userId' | 'tool' | 'permissionClass' | 'correlationId' | 'persona'> & { kind?: string },
  action: string,
  status: LedgerStatus,
  extra: { outputSummary?: string; confirmationMethod?: string; strict?: boolean } = {},
): Promise<void> {
  // strict: throws when the ledger is down, for transitions that must not proceed unrecorded.
  const write = extra.strict ? recordAction : recordActionSafe;
  await write({
    userId: row.userId,
    initiator: 'user',
    persona: row.persona,
    tool: row.tool,
    action,
    permissionClass: row.permissionClass,
    status,
    confirmationMethod: extra.confirmationMethod,
    outputSummary: extra.outputSummary,
    validationResult: JSON.stringify({ approvalId: row.id, ...protectedMetaOf(row) }),
    correlationId: row.correlationId,
  });
}

export interface CreateApprovalInput {
  userId: string;
  kind: ApprovalKind;
  tool?: string | null;
  params: unknown;
  persona?: string;
  correlationId: string;
  conversationId?: string | null;
  permissionClass?: string;
  summary?: string;
  now?: Clock;
}

export async function createApproval(input: CreateApprovalInput): Promise<ApprovalView> {
  const { userId, kind } = input;
  if (!userId) throw new Error('approvals: userId is required');
  const tool = kind === 'tool_call' ? (input.tool ?? null) : null;
  if (kind === 'tool_call' && !tool) throw new Error('approvals: tool is required for tool_call');
  // H1: no approval is ever created for a gateway call by a user who may not use the gateway.
  if (tool && isGatewayTool(tool) && !(await canUseGatewayTool(userId, tool))) throw new Error('approvals: gateway_not_permitted');

  if (input.conversationId) {
    const conv = await prisma.conversation.findFirst({ where: { id: input.conversationId, userId }, select: { id: true } });
    if (!conv) throw new Error('approvals: conversation not found');
  }

  // Normalise through JSON so the hash matches what Postgres jsonb hands back.
  const params: unknown = input.params === undefined ? null : JSON.parse(JSON.stringify(input.params));
  const contentHash = approvalContentHash({ kind, tool, params });
  const now = (input.now ?? systemClock)();
  const persona = input.persona ?? 'WHINK';
  const permissionClass = input.permissionClass ?? 'C';

  const row = await prisma.approvalRequest.create({
    data: {
      userId,
      kind,
      tool,
      params: params === null ? undefined : (params as object),
      contentHash,
      summary: input.summary ?? summarise(kind, tool, params),
      permissionClass,
      status: 'PENDING',
      correlationId: input.correlationId,
      conversationId: input.conversationId ?? null,
      persona,
      createdAt: now,
      expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
    },
  }) as ApprovalRow;

  try {
    await recordAction({
      userId,
      initiator: 'system',
      persona,
      tool,
      action: 'approval_created',
      permissionClass,
      status: 'AWAITING_APPROVAL',
      inputSummary: row.summary,
      validationResult: JSON.stringify({ approvalId: row.id, contentHash, ...protectedMetaOf({ kind, tool }) }),
      correlationId: input.correlationId,
    });
  } catch (e) {
    // No pending approval without a ledger row.
    await prisma.approvalRequest.deleteMany({ where: { id: row.id, userId } });
    logger.error('approval ledger write failed; approval discarded', { userId, error: (e as Error)?.message });
    throw new Error('Action ledger unavailable; approval not created');
  }

  return toView(row);
}

/**
 * Terminal housekeeping for one user's approvals (always scoped by userId).
 * (a) PENDING rows past expiresAt become EXPIRED, one approval_expired ledger row each.
 * (b) EXECUTING rows older than EXECUTING_STUCK_MS become FAILED (approval_stuck_failed).
 *     Stuck rows are never re-run. Each move is an atomic conditional update, so
 *     concurrent sweeps and decisions ledger each row at most once.
 * Ledger writes here are best-effort (recordActionSafe): the state change has already
 * committed and cannot be retried, and a ledger outage must not break listing.
 */
export async function sweepApprovals(now: Date, userId: string): Promise<{ expired: number; stuckFailed: number }> {
  if (!userId) throw new Error('approvals: userId is required');
  let expired = 0;
  let stuckFailed = 0;

  const stale = await prisma.approvalRequest.findMany({
    where: { userId, status: 'PENDING', expiresAt: { lte: now } },
  }) as ApprovalRow[];
  for (const row of stale) {
    const won = await prisma.approvalRequest.updateMany({
      where: { id: row.id, userId, status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED', decidedAt: now },
    });
    if (won.count !== 1) continue;
    expired++;
    await ledger(row, 'approval_expired', 'DENIED', { outputSummary: 'Expired before a decision' });
  }

  const cutoff = new Date(now.getTime() - EXECUTING_STUCK_MS);
  const stuck = await prisma.approvalRequest.findMany({
    where: { userId, status: 'EXECUTING', decidedAt: { lt: cutoff } },
  }) as ApprovalRow[];
  for (const row of stuck) {
    const won = await prisma.approvalRequest.updateMany({
      where: { id: row.id, userId, status: 'EXECUTING', decidedAt: { lt: cutoff } },
      data: { status: 'FAILED', result: { success: false, error: 'Execution did not complete; not re-run' } },
    });
    if (won.count !== 1) continue;
    stuckFailed++;
    await ledger(row, 'approval_stuck_failed', 'FAILED', { outputSummary: 'Stuck in EXECUTING; failed, never re-run' });
  }
  return { expired, stuckFailed };
}

async function sweepQuietly(userId: string, now: Date): Promise<void> {
  try {
    await sweepApprovals(now, userId);
  } catch (e) {
    logger.error('approval sweep failed', { userId, error: (e as Error)?.message });
  }
}

export async function listPending(userId: string, now: Clock = systemClock): Promise<ApprovalView[]> {
  await sweepQuietly(userId, now());
  const rows = await prisma.approvalRequest.findMany({
    where: { userId, status: 'PENDING', expiresAt: { gt: now() } },
    orderBy: { createdAt: 'asc' },
  }) as ApprovalRow[];
  return rows.map(toView);
}

function capResult(result: ApprovalResult): ApprovalResult {
  let data = result.data;
  if (data !== undefined) {
    let s: string;
    try { s = JSON.stringify(data) ?? ''; } catch { s = '[unserialisable]'; }
    if (s.length > RESULT_CAP) data = s.substring(0, RESULT_CAP);
  }
  return { success: result.success, ...(data !== undefined ? { data } : {}), ...(result.error ? { error: result.error.substring(0, 500) } : {}) };
}

/** Re-read after a lost atomic update to say why it lost. Never reveals other users' rows. */
async function explainLoss(userId: string, id: string): Promise<DecisionOutcome> {
  const row = await prisma.approvalRequest.findFirst({ where: { id, userId } }) as ApprovalRow | null;
  if (!row) {
    await logSecurityEvent(userId, 'approval_not_found', `Decision attempted on unknown approval id ${id.substring(0, 64)}`);
    return { id, status: 'NOT_FOUND', result: null };
  }
  if (row.status === 'EXPIRED') return { id, status: 'EXPIRED', result: null };
  return { id, status: 'ALREADY_DECIDED', result: null };
}

async function finish(
  row: ApprovalRow,
  from: 'EXECUTING',
  status: 'EXECUTED' | 'FAILED',
  result: ApprovalResult,
  now: Clock,
): Promise<DecisionOutcome> {
  const capped = capResult(result);
  await prisma.approvalRequest.updateMany({
    where: { id: row.id, userId: row.userId, status: from },
    data: { status, executedAt: now(), result: capped as object },
  });
  await ledger(
    row,
    status === 'EXECUTED' ? 'approval_executed' : 'approval_failed',
    status === 'EXECUTED' ? 'VALIDATED' : 'FAILED',
    { outputSummary: (capped.error ?? 'ok').substring(0, 300), confirmationMethod: 'user_confirmed' },
  );
  return { id: row.id, status, result: capped };
}

const MAX_AUTONOMY = 4;

function parseAutonomyParams(params: unknown): { from: number; to: number } | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const { from, to } = params as { from?: unknown; to?: unknown };
  if (typeof from !== 'number' || typeof to !== 'number') return null;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null;
  if (from < 0 || to > MAX_AUTONOMY || from >= to) return null;
  return { from, to };
}

/**
 * The only code path that can raise autonomy. Runs after the approval won
 * PENDING to EXECUTING and the hash check. Compare-and-set on the current level
 * so a level changed since the request means nothing is applied.
 */
async function applyAutonomyChange(row: ApprovalRow, clock: Clock): Promise<DecisionOutcome> {
  const perm = await checkApprovedAction(row.userId, row.id, 'autonomy_change', row.contentHash);
  if (!perm.allowed) {
    return finish(row, 'EXECUTING', 'FAILED', { success: false, error: perm.reason ?? 'Permission denied' }, clock);
  }
  const change = parseAutonomyParams(row.params);
  if (!change) {
    return finish(row, 'EXECUTING', 'FAILED', { success: false, error: 'Invalid autonomy change; not applied' }, clock);
  }
  const res = await prisma.userProfile.updateMany({
    where: { userId: row.userId, autonomyLevel: change.from },
    data: { autonomyLevel: change.to },
  });
  const applied = res.count === 1;
  await recordActionSafe({
    userId: row.userId,
    initiator: 'user',
    persona: row.persona,
    action: 'autonomy_level_change',
    permissionClass: 'C',
    status: applied ? 'VALIDATED' : 'FAILED',
    confirmationMethod: 'user_confirmed',
    inputSummary: JSON.stringify(change),
    outputSummary: applied ? 'Autonomy raised' : 'Autonomy level changed since request; not applied',
    validationResult: JSON.stringify({ ...change, approvalId: row.id }),
    correlationId: row.correlationId,
  });
  if (!applied) {
    return finish(row, 'EXECUTING', 'FAILED', { success: false, error: 'Autonomy level changed since the request; not applied' }, clock);
  }
  return finish(row, 'EXECUTING', 'EXECUTED', { success: true, data: change }, clock);
}

export async function decide(
  userId: string,
  id: string,
  decision: 'approve' | 'deny',
  deps: { now?: Clock } = {},
): Promise<DecisionOutcome> {
  const clock = deps.now ?? systemClock;
  if (isBulkApprovalId(id)) {
    // No "approve all": a decision names exactly one request id.
    await logSecurityEvent(userId, 'bulk_approval_refused', 'Decision attempted without a single request id');
    return { id, status: 'NOT_FOUND', result: null };
  }
  const now = clock();
  await sweepQuietly(userId, now);

  // B4: atomically expire a stale PENDING row.
  const expired = await prisma.approvalRequest.updateMany({
    where: { id, userId, status: 'PENDING', expiresAt: { lte: now } },
    data: { status: 'EXPIRED', decidedAt: now },
  });
  if (expired.count === 1) {
    const row = await prisma.approvalRequest.findFirst({ where: { id, userId } }) as ApprovalRow | null;
    if (row) await ledger(row, 'approval_expired', 'DENIED', { outputSummary: 'Expired before a decision' });
    return { id, status: 'EXPIRED', result: null };
  }

  if (decision === 'deny') {
    const won = await prisma.approvalRequest.updateMany({
      where: { id, userId, status: 'PENDING', expiresAt: { gt: now } },
      data: { status: 'DENIED', decidedAt: now },
    });
    if (won.count !== 1) return explainLoss(userId, id);
    const row = await prisma.approvalRequest.findFirst({ where: { id, userId } }) as ApprovalRow | null;
    if (row) await ledger(row, 'approval_denied', 'DENIED', { confirmationMethod: 'user_denied' });
    return { id, status: 'DENIED', result: null };
  }

  // B5: single atomic winner. No read before this write.
  const won = await prisma.approvalRequest.updateMany({
    where: { id, userId, status: 'PENDING', expiresAt: { gt: now } },
    data: { status: 'EXECUTING', decidedAt: now },
  });
  if (won.count !== 1) return explainLoss(userId, id);

  const row = await prisma.approvalRequest.findFirst({ where: { id, userId } }) as ApprovalRow | null;
  if (!row) return { id, status: 'FAILED', result: { success: false, error: 'Approval vanished' } };
  // L4: no execution without the approval being on the ledger first. If the write fails, fail the row, run nothing.
  try {
    await ledger(row, 'approval_approved', 'VALIDATED', { confirmationMethod: 'user_confirmed', strict: true });
  } catch (e) {
    logger.error('approval_approved ledger write failed; not run', { userId, approvalId: row.id, error: (e as Error)?.message });
    await prisma.approvalRequest.updateMany({
      where: { id: row.id, userId, status: 'EXECUTING' },
      data: { status: 'FAILED', executedAt: clock(), result: { success: false, error: 'Action ledger unavailable; not run' } },
    });
    return { id, status: 'FAILED', result: { success: false, error: 'Action ledger unavailable; not run' } };
  }

  // B6: hash lock on the stored content.
  let recomputed = '';
  try {
    recomputed = approvalContentHash({ kind: row.kind, tool: row.tool, params: row.params });
  } catch {
    recomputed = '';
  }
  if (recomputed !== row.contentHash) {
    await logSecurityEvent(userId, 'approval_hash_mismatch', `Approval ${row.id} content changed after creation; not run`, row.correlationId);
    return finish(row, 'EXECUTING', 'FAILED', { success: false, error: 'Approved content no longer matches; not run' }, clock);
  }

  try {
    if (row.kind === 'autonomy_change') {
      return await applyAutonomyChange(row, clock);
    }
    if (row.kind === 'scheduled_post') {
      // Stores the scheduled row after the permission engine allows it. Sending happens later, in the worker.
      const { activateScheduledPost } = await import('@/lib/social/scheduler');
      const res = await activateScheduledPost({
        id: row.id,
        userId: row.userId,
        params: row.params,
        contentHash: row.contentHash,
        correlationId: row.correlationId,
        persona: row.persona,
      }, clock());
      return finish(row, 'EXECUTING', res.success ? 'EXECUTED' : 'FAILED',
        res.success ? { success: true, data: res.data } : { success: false, error: res.error ?? 'Not scheduled' }, clock);
    }
    if (row.kind === 'ear') {
      // B3: the engine decides, even for EARs.
      const perm = await checkApprovedAction(userId, row.id, 'ear', row.contentHash);
      if (!perm.allowed) {
        return finish(row, 'EXECUTING', 'FAILED', { success: false, error: perm.reason ?? 'Permission denied' }, clock);
      }
      const ear = row.params as ExecutionAuthorizationRequest;
      return finish(row, 'EXECUTING', 'EXECUTED', { success: true, data: buildDispatchMessage(ear, row.persona) }, clock);
    }

    // Dynamic import: tool-registry imports this module (createApproval).
    const { executeApprovedTool } = await import('@/lib/tool-registry');
    const res = await executeApprovedTool(userId, {
      id: row.id,
      tool: row.tool ?? '',
      params: row.params,
      contentHash: row.contentHash,
      correlationId: row.correlationId,
      persona: row.persona,
    });
    return finish(row, 'EXECUTING', res.success ? 'EXECUTED' : 'FAILED',
      { success: res.success, data: res.data, error: res.error }, clock);
  } catch (e) {
    logger.error('approved execution threw', { userId, approvalId: row.id, error: (e as Error)?.message });
    return finish(row, 'EXECUTING', 'FAILED', { success: false, error: 'Execution failed' }, clock);
  }
}
