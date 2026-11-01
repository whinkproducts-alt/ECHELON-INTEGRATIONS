/**
 * Scheduled social posts (D8).
 *
 * Flow: social_schedule_post (Class C) creates an approval of kind 'scheduled_post'.
 * When the human approves, activateScheduledPost stores a scheduled_posts row. NOTHING is
 * sent then. The worker (instrumentation.ts) later picks due rows atomically, re-checks
 * the content hash against what was approved, asks the permission engine, and sends
 * through the same credential path as every other social call.
 *
 * Editing a scheduled post cancels it and raises a new approval. The 30 s approval
 * expiry limits the approval window, not the send time.
 *
 * The worker's due-row scan is system-wide by nature. Every read after it and every write
 * is scoped by the row's own userId.
 */

import { prisma } from '@/lib/db';
import { logger, generateCorrelationId } from '@/lib/logger';
import { recordAction, recordActionSafe, updateActionStatus } from '@/lib/ledger';
import { SCHEDULED_DEF_CHANGED, checkApprovedAction, checkScheduledSend, logSecurityEvent } from '@/lib/permission-engine';
import { toolArgsHash } from '@/lib/canonical-json';
import { createApproval, type ApprovalView } from '@/lib/approvals';
import { callSocialTool } from '@/lib/social/execute';
import { getConnectedPlatformUserId, hasActiveConnection } from '@/lib/social/connections';
import { sweepOAuthStates } from '@/lib/social/oauth';
import { SCHEDULED_POST_TOOL } from '@/lib/social/scheduled-store';
import { DAILY_CAP_ERROR, checkDailyCap, ledgerCapRefusal } from '@/lib/social/caps';

export const SCHEDULE_TOOL_NAME = 'social_schedule_post';
export { SCHEDULED_POST_TOOL };
export const MAX_POST_CHARS = 280;
const MAX_HORIZON_MS = 365 * 24 * 60 * 60_000;
/** A row stuck in 'sending' this long is failed and never re-sent (a duplicate post is worse than a missed one). */
export const SENDING_STUCK_MS = 10 * 60_000;
const BATCH = 10;

/** The model-supplied part of a schedule request, validated. */
export interface ScheduleCore {
  platform: 'x';
  tool: typeof SCHEDULED_POST_TOOL;
  args: { text: string };
  send_at: string;
}

/**
 * Approval params for a scheduled post. defHash is the sanitised definition hash of
 * the scheduled gateway tool at request time; it is set by the server, never by the model, and the
 * approval content hash covers it. A send is refused if the live definition differs.
 */
export interface ScheduleParams extends ScheduleCore {
  defHash: string;
}

export type ParseResult = { ok: true; value: ScheduleCore } | { ok: false; error: string };

/** send_at must carry an explicit offset: Z or +/-hh:mm. A bare local time is ambiguous and refused. */
const ISO_WITH_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Validate model-supplied tool input into the canonical approval params. Never trusts extra keys. */
export function parseScheduleInput(input: unknown, now: Date = new Date()): ParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'Invalid input' };
  const i = input as Record<string, unknown>;
  if (i.platform !== 'x') return { ok: false, error: 'Only platform "x" can be scheduled' };
  if (typeof i.text !== 'string' || i.text.trim().length === 0 || i.text.length > MAX_POST_CHARS) {
    return { ok: false, error: `text must be 1 to ${MAX_POST_CHARS} characters` };
  }
  if (typeof i.send_at !== 'string' || !ISO_WITH_OFFSET_RE.test(i.send_at)) {
    return { ok: false, error: 'send_at must be an ISO 8601 date-time with a timezone (Z or +/-hh:mm)' };
  }
  const at = new Date(i.send_at);
  if (Number.isNaN(at.getTime())) return { ok: false, error: 'send_at must be an ISO 8601 date-time' };
  if (at.getTime() <= now.getTime()) return { ok: false, error: 'send_at must be in the future' };
  if (at.getTime() > now.getTime() + MAX_HORIZON_MS) return { ok: false, error: 'send_at is more than a year away' };
  return { ok: true, value: { platform: 'x', tool: SCHEDULED_POST_TOOL, args: { text: i.text }, send_at: at.toISOString() } };
}

/** Validate params as stored on an approval row (already canonical). */
function parseStoredParams(params: unknown, now: Date): ParseResult {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return { ok: false, error: 'Invalid scheduled post' };
  const p = params as Record<string, unknown>;
  const args = p.args as { text?: unknown } | null;
  if (p.tool !== SCHEDULED_POST_TOOL || !args || typeof args !== 'object') return { ok: false, error: 'Invalid scheduled post' };
  return parseScheduleInput({ platform: p.platform, text: args.text, send_at: p.send_at }, now);
}

/**
 * The live sanitised-definition hash of the scheduled tool, from a registration of the gateway.
 * Null when the gateway is unavailable or does not advertise the tool. Imported lazily because
 * tool-registry imports this module.
 */
async function liveScheduledToolDefHash(userId: string, fresh: boolean): Promise<string | null> {
  const reg = await import('@/lib/tool-registry');
  const loaded = await reg.loadGatewayTools(userId, { fresh }).catch(() => null);
  if (!loaded || !loaded.available) return null;
  return reg.getGatewayDefHash(SCHEDULED_POST_TOOL);
}

/** Daily-cap gate for a schedule request, evaluated for the day the post would go out. */
export async function checkScheduleCap(
  userId: string,
  sendAtIso: string,
  persona: string | undefined,
  correlationId: string,
  excludeScheduledId?: string,
): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const check = await checkDailyCap(userId, 'posts', { day: new Date(sendAtIso), excludeScheduledId });
  if (check.allowed) return { allowed: true };
  await ledgerCapRefusal(userId, SCHEDULED_POST_TOOL, check, { persona, correlationId, stage: 'before_approval' });
  return { allowed: false, error: DAILY_CAP_ERROR };
}

export interface ActivateResult {
  success: boolean;
  data?: { scheduledPostId: string; sendAt: string };
  error?: string;
}

/**
 * Called by approvals.decide after the approval won PENDING -> EXECUTING and the hash lock.
 * Stores the scheduled row. Does not send.
 */
export async function activateScheduledPost(
  row: { id: string; userId: string; params: unknown; contentHash: string; correlationId: string; persona: string },
  now: Date = new Date(),
): Promise<ActivateResult> {
  const perm = await checkApprovedAction(row.userId, row.id, 'scheduled_post', row.contentHash);
  if (!perm.allowed) return { success: false, error: perm.reason ?? 'Permission denied' };
  const parsed = parseStoredParams(row.params, now);
  if (!parsed.ok) {
    return { success: false, error: parsed.error === 'send_at must be in the future' ? 'The send time has already passed; not scheduled' : parsed.error };
  }
  const v = parsed.value;
  if (!(await hasActiveConnection(row.userId, v.platform))) return { success: false, error: 'X is not connected; not scheduled' };
  const platformUserId = await getConnectedPlatformUserId(row.userId, v.platform);
  if (!platformUserId) return { success: false, error: 'The connected X account could not be identified; reconnect X. Not scheduled' };

  const sendAt = new Date(v.send_at);
  const created = await prisma.scheduledPost.create({
    data: {
      userId: row.userId,
      approvalId: row.id,
      platform: v.platform,
      platformUserId,
      tool: v.tool,
      args: v.args,
      contentHash: toolArgsHash({ tool: v.tool, args: v.args }),
      sendAt,
      status: 'scheduled',
    },
  });
  await recordActionSafe({
    userId: row.userId,
    initiator: 'user',
    persona: row.persona,
    tool: SCHEDULED_POST_TOOL,
    action: 'scheduled_post_created',
    permissionClass: 'C',
    status: 'VALIDATED',
    confirmationMethod: 'user_confirmed',
    outputSummary: `scheduled for ${v.send_at}`,
    validationResult: JSON.stringify({ approvalId: row.id, scheduledPostId: created.id }),
    correlationId: row.correlationId,
  });
  return { success: true, data: { scheduledPostId: created.id, sendAt: v.send_at } };
}

export interface ScheduledView {
  id: string;
  platform: string;
  text: string;
  sendAt: string;
  status: string;
}

export async function listScheduledPosts(userId: string): Promise<ScheduledView[]> {
  if (!userId) throw new Error('social: userId is required');
  const rows = await prisma.scheduledPost.findMany({
    where: { userId, status: { in: ['scheduled', 'sending'] } },
    orderBy: { sendAt: 'asc' },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    text: String((r.args as { text?: unknown } | null)?.text ?? ''),
    sendAt: r.sendAt.toISOString(),
    status: r.status,
  }));
}

/** Cancel a scheduled (not yet sending) post. Atomic, scoped by userId. */
export async function cancelScheduledPost(userId: string, id: string, reason = 'cancelled_by_user'): Promise<boolean> {
  if (!userId || !id) throw new Error('social: userId and id are required');
  const res = await prisma.scheduledPost.updateMany({
    where: { id, userId, status: 'scheduled' },
    data: { status: 'cancelled', error: reason },
  });
  if (res.count !== 1) return false;
  await recordActionSafe({
    userId,
    initiator: 'user',
    tool: SCHEDULED_POST_TOOL,
    action: 'scheduled_post_cancelled',
    permissionClass: 'C',
    status: 'VALIDATED',
    outputSummary: reason,
    validationResult: JSON.stringify({ scheduledPostId: id }),
  });
  return true;
}

/**
 * Editing = cancel the old scheduled post and raise a NEW approval for the new content.
 * The edit itself never changes the stored row, so approved content cannot drift.
 */
export async function editScheduledPost(
  userId: string,
  id: string,
  changes: { text?: unknown; send_at?: unknown },
  now: Date = new Date(),
): Promise<
  | { ok: true; approval: ApprovalView }
  | { ok: false; error: string; status: 400 | 404 | 409 | 429 | 500; cancelled?: boolean }
> {
  if (!userId || !id) throw new Error('social: userId and id are required');
  const existing = await prisma.scheduledPost.findFirst({ where: { id, userId } });
  if (!existing) return { ok: false, error: 'Not found', status: 404 };
  if (existing.status !== 'scheduled') return { ok: false, error: 'Only a scheduled post can be edited', status: 409 };

  const oldText = (existing.args as { text?: unknown } | null)?.text;
  const parsed = parseScheduleInput(
    {
      platform: existing.platform,
      text: changes.text ?? oldText,
      send_at: changes.send_at ?? existing.sendAt.toISOString(),
    },
    now,
  );
  if (!parsed.ok) return { ok: false, error: parsed.error, status: 400 };

  const correlationId = generateCorrelationId();
  // Cap check before cancelling, not counting the post being replaced.
  const cap = await checkScheduleCap(userId, parsed.value.send_at, undefined, correlationId, id);
  if (!cap.allowed) return { ok: false, error: cap.error, status: 429 };

  if (!(await cancelScheduledPost(userId, id, 'edited_new_approval_required'))) {
    return { ok: false, error: 'Post is no longer editable', status: 409 };
  }
  try {
    const approval = await createScheduleApproval(userId, parsed.value, correlationId);
    return { ok: true, approval };
  } catch (e) {
    // The old post is already cancelled and nothing was sent. Say so cleanly instead of a bare 500.
    logger.error('scheduled post edit: approval creation failed after cancel', { userId, scheduledPostId: id, error: (e as Error)?.message });
    return {
      ok: false,
      error: 'The old scheduled post was cancelled but the new approval could not be created. Nothing was sent. Schedule it again.',
      status: 500,
      cancelled: true,
    };
  }
}

/** Create the 'scheduled_post' approval for validated params. */
export async function createScheduleApproval(
  userId: string,
  value: ScheduleCore,
  correlationId: string,
  persona?: string,
): Promise<ApprovalView> {
  const defHash = await liveScheduledToolDefHash(userId, false);
  if (!defHash) throw new Error('gateway_definition_unavailable');
  const params: ScheduleParams = { ...value, defHash };
  return createApproval({
    userId,
    kind: 'scheduled_post',
    params,
    persona,
    correlationId,
    permissionClass: 'C',
  });
}

async function finishRow(
  userId: string,
  id: string,
  status: 'sent' | 'failed',
  error: string | null,
): Promise<void> {
  await prisma.scheduledPost.updateMany({
    where: { id, userId, status: 'sending' },
    data: { status, error, sentAt: status === 'sent' ? new Date() : null },
  });
}

/** Send one due post. Exactly one caller can win the claim; a lost claim does nothing. */
export async function sendScheduledPost(userId: string, id: string): Promise<'sent' | 'failed' | 'skipped'> {
  const claim = await prisma.scheduledPost.updateMany({
    where: { id, userId, status: 'scheduled' },
    data: { status: 'sending' },
  });
  if (claim.count !== 1) return 'skipped';
  const row = await prisma.scheduledPost.findFirst({ where: { id, userId } });
  if (!row) return 'skipped';

  const correlationId = generateCorrelationId();
  const base = {
    userId,
    initiator: 'automation' as const,
    tool: row.tool,
    permissionClass: 'C',
    correlationId,
    validationResult: JSON.stringify({ approvalId: row.approvalId, scheduledPostId: row.id }),
  };
  const fail = async (error: string, securityEvent?: { name: string; detail: string }): Promise<'failed'> => {
    await finishRow(userId, id, 'failed', error);
    if (securityEvent) {
      try {
        await logSecurityEvent(userId, securityEvent.name, securityEvent.detail, correlationId, 'FAILED');
      } catch (e) {
        logger.error('security event write failed', { userId, error: (e as Error)?.message });
      }
    }
    await recordActionSafe({ ...base, action: 'scheduled_post_failed', status: 'FAILED', outputSummary: error, latencyMs: 0 });
    return 'failed';
  };

  // Hash re-check against what is stored now.
  let recomputed = '';
  try { recomputed = toolArgsHash({ tool: row.tool, args: row.args }); } catch { recomputed = ''; }
  if (recomputed !== row.contentHash) return fail('Content changed since approval; not sent', { name: 'scheduled_post_hash_mismatch', detail: `Scheduled post ${row.id} content no longer matches the approved hash; not sent` });

  // Only the approved shape may be sent: an X post, nothing else.
  if (row.tool !== SCHEDULED_POST_TOOL || row.platform !== 'x') return fail('Unsupported scheduled tool; not sent');

  // The connected platform account must still be the one the post was approved for.
  const currentPlatformUserId = await getConnectedPlatformUserId(userId, 'x');
  if (!row.platformUserId || !currentPlatformUserId || row.platformUserId !== currentPlatformUserId) {
    return fail('Connected account changed since scheduling; not sent', { name: 'scheduled_post_account_changed', detail: `Scheduled post ${row.id}: the connected X account differs from the approved one; not sent` });
  }

  // Fresh registration: the tool definition must still be the one the human approved.
  const liveDefHash = await liveScheduledToolDefHash(userId, true);
  if (!liveDefHash) return fail('Gateway unavailable; not sent');

  const perm = await checkScheduledSend(userId, row.approvalId, { tool: row.tool, args: row.args, contentHash: row.contentHash, liveDefHash });
  if (!perm.allowed) {
    if (perm.reason === SCHEDULED_DEF_CHANGED) {
      return fail(perm.reason, { name: 'tool_definition_changed', detail: `Gateway tool ${row.tool} changed since scheduled post ${row.id} was approved; not sent` });
    }
    return fail(
      perm.reason ?? 'Permission denied',
      perm.reason === 'Scheduled content does not match the approved content'
        ? { name: 'scheduled_post_hash_mismatch', detail: `Scheduled post ${row.id} content no longer matches the approved hash; not sent` }
        : undefined,
    );
  }

  // Daily cap, again at execution (this row is already 'sending', so exclude it from the count).
  const cap = await checkDailyCap(userId, 'posts', { excludeScheduledId: row.id });
  if (!cap.allowed) {
    await ledgerCapRefusal(userId, row.tool, cap, { correlationId, stage: 'at_execution' });
    return fail('daily_cap_reached');
  }

  let ledgerRow: { id: string };
  try {
    ledgerRow = await recordAction({
      ...base,
      action: `tool_executed: ${row.tool}`,
      confirmationMethod: 'user_confirmed',
      status: 'SUBMITTED',
      inputSummary: JSON.stringify(row.args).substring(0, 500),
      latencyMs: 0,
    });
  } catch {
    logger.error('ledger pre-write failed; scheduled post not sent', { userId });
    await finishRow(userId, id, 'failed', 'Action ledger unavailable; not sent');
    return 'failed';
  }

  const started = Date.now();
  try {
    const res = await callSocialTool(userId, 'x', 'x__post', row.args);
    if (!res.success) {
      await finishRow(userId, id, 'failed', res.error.substring(0, 300));
      await updateActionStatus(userId, ledgerRow.id, { status: 'FAILED', outputSummary: res.error, latencyMs: Date.now() - started });
      return 'failed';
    }
    await finishRow(userId, id, 'sent', null);
    await updateActionStatus(userId, ledgerRow.id, { status: 'VALIDATED', outputSummary: 'sent', latencyMs: Date.now() - started });
    return 'sent';
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Send failed';
    await finishRow(userId, id, 'failed', msg.substring(0, 300));
    await updateActionStatus(userId, ledgerRow.id, { status: 'FAILED', outputSummary: msg, latencyMs: Date.now() - started });
    return 'failed';
  }
}

/** One worker pass. Fails stuck rows, then sends the due ones. Never throws. */
export async function processDueScheduledPosts(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  try {
    try {
      await sweepOAuthStates(now);
    } catch (e) {
      logger.error('oauth state sweep failed', { error: (e as Error)?.message });
    }
    const stuck = await prisma.scheduledPost.findMany({
      where: { status: 'sending', updatedAt: { lt: new Date(now.getTime() - SENDING_STUCK_MS) } },
      select: { id: true, userId: true },
      take: BATCH,
    });
    for (const s of stuck) {
      const res = await prisma.scheduledPost.updateMany({
        where: { id: s.id, userId: s.userId, status: 'sending' },
        data: { status: 'failed', error: 'Interrupted while sending; not re-sent' },
      });
      if (res.count === 1) {
        await recordActionSafe({
          userId: s.userId, initiator: 'automation', tool: SCHEDULED_POST_TOOL, action: 'scheduled_post_failed',
          permissionClass: 'C', status: 'FAILED', outputSummary: 'Interrupted while sending; not re-sent',
          validationResult: JSON.stringify({ scheduledPostId: s.id }),
        });
      }
    }
    const due = await prisma.scheduledPost.findMany({
      where: { status: 'scheduled', sendAt: { lte: now } },
      orderBy: { sendAt: 'asc' },
      select: { id: true, userId: true },
      take: BATCH,
    });
    for (const d of due) {
      const r = await sendScheduledPost(d.userId, d.id);
      if (r === 'sent') sent++;
      else if (r === 'failed') failed++;
    }
  } catch (e) {
    logger.error('scheduled post worker pass failed', { error: (e as Error)?.message });
  }
  return { sent, failed };
}

const WORKER_KEY = Symbol.for('whink.social.worker');
export const WORKER_INTERVAL_MS = 30_000;

/** Start the in-process worker once per process. Returns false when it was already running. */
export function startScheduledPostWorker(): boolean {
  const g = globalThis as unknown as Record<symbol, unknown>;
  if (g[WORKER_KEY]) return false;
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void processDueScheduledPosts().finally(() => { running = false; });
  }, WORKER_INTERVAL_MS);
  timer.unref?.();
  g[WORKER_KEY] = timer;
  return true;
}
