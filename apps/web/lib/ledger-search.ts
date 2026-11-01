/**
 * Read-only history and search over the user's own approvals and ledger rows.
 *
 * Every query is scoped by userId and built from Prisma where objects with bound values only.
 * Output is redacted: parameter keys that look like secrets and values that match a known
 * secret pattern are replaced. Hashes and confirmation codes are never returned.
 * This module never writes: the ledger write path stays lib/ledger.ts.
 */
import { prisma } from '@/lib/db';
import { SECRET_RULES } from '@/lib/secret-scan';
import { classifyProtected, type ProtectedCategory } from '@/lib/protected-actions';

export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 50;
const MAX_STRING = 4000;
const MAX_DEPTH = 6;
const MAX_KEYS = 100;
export const REDACTED = '[redacted]';

const SECRET_KEY_RE = /token|secret|passw(?:or)?d|passwd|authorization|api[-_]?key|apikey|credential|confirmation|cookie|private[-_]?key|bearer|signature/i;

/** Deep-copy a value with secret-looking keys and secret-looking strings replaced. Depth, key and string sizes are capped. */
export function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (SECRET_RULES.some((r) => r.re.test(value))) return REDACTED;
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '…' : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      out[k] = SECRET_KEY_RE.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return undefined;
}

export function redactText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const r = redact(v);
  return typeof r === 'string' ? r : null;
}

// ── cursor ──────────────────────────────────────────────────────

export interface Cursor { t: Date; id: string }

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
}

/** Returns null for a malformed cursor (the route answers 400). */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const p = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { t?: unknown; id?: unknown };
    if (typeof p.t !== 'string' || typeof p.id !== 'string' || p.id.length > 64) return null;
    const t = new Date(p.t);
    if (Number.isNaN(t.getTime())) return null;
    return { t, id: p.id };
  } catch {
    return null;
  }
}

function cursorWhere(c: Cursor | null) {
  return c ? { OR: [{ createdAt: { lt: c.t } }, { createdAt: c.t, id: { lt: c.id } }] } : null;
}

// ── approvals history ───────────────────────────────────────────

export const APPROVAL_STATUSES = ['AWAITING_APPROVAL', 'APPROVED', 'DENIED', 'EXPIRED', 'EXECUTED', 'FAILED'] as const;
export type ApprovalHistoryStatus = (typeof APPROVAL_STATUSES)[number];
export const APPROVAL_KINDS = ['tool_call', 'ear', 'autonomy_change', 'scheduled_post'] as const;

export interface ApprovalHistoryFilter {
  status?: ApprovalHistoryStatus;
  category?: ProtectedCategory;
  kind?: (typeof APPROVAL_KINDS)[number];
  from?: Date;
  to?: Date;
  cursor?: Cursor | null;
  limit?: number;
}

interface ApprovalRowLike {
  id: string; userId: string; kind: string; tool: string | null; params: unknown; summary: string;
  permissionClass: string; status: string; correlationId: string; conversationId: string | null; persona: string;
  createdAt: Date; expiresAt: Date; decidedAt: Date | null; executedAt: Date | null; result: unknown;
}

function displayStatus(r: Pick<ApprovalRowLike, 'status' | 'expiresAt'>, now: Date): ApprovalHistoryStatus {
  switch (r.status) {
    case 'PENDING': return r.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'AWAITING_APPROVAL';
    case 'APPROVED':
    case 'EXECUTING': return 'APPROVED';
    case 'EXECUTED': return 'EXECUTED';
    case 'DENIED': return 'DENIED';
    case 'EXPIRED': return 'EXPIRED';
    default: return 'FAILED';
  }
}

export function toHistoryItem(r: ApprovalRowLike, now = new Date()) {
  const status = displayStatus(r, now);
  const cls = classifyProtected({ toolName: r.tool ?? r.kind, params: r.params });
  const decided = r.decidedAt != null && (status === 'APPROVED' || status === 'DENIED' || status === 'EXECUTED' || status === 'FAILED');
  return {
    id: r.id,
    kind: r.kind,
    tool: r.tool,
    summary: redactText(r.summary),
    params: redact(r.params ?? null),
    permissionClass: r.permissionClass,
    protected: cls.protected,
    category: cls.protected ? (cls.category ?? null) : null,
    status,
    persona: r.persona,
    correlationId: r.correlationId,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    expiredAt: status === 'EXPIRED' ? r.expiresAt.toISOString() : null,
    executedAt: r.executedAt ? r.executedAt.toISOString() : null,
    // Only the account owner ever decides on their own request, so this is the caller's own id or null.
    decidedBy: decided ? r.userId : null,
    outcome: { status, result: r.result == null ? null : redact(r.result) },
  };
}

function statusWhere(status: ApprovalHistoryStatus, now: Date): Record<string, unknown> {
  switch (status) {
    case 'AWAITING_APPROVAL': return { status: 'PENDING', expiresAt: { gt: now } };
    case 'APPROVED': return { status: { in: ['APPROVED', 'EXECUTING'] } };
    case 'EXPIRED': return { OR: [{ status: 'EXPIRED' }, { status: 'PENDING', expiresAt: { lte: now } }] };
    default: return { status };
  }
}

/**
 * Category is computed (it depends on parameters), so it cannot be a database filter. When it is
 * set we page through batches and filter in memory until the page is full or a batch cap is hit.
 */
export async function listApprovalHistory(userId: string, f: ApprovalHistoryFilter, now = new Date()) {
  if (!userId) throw new Error('approval history: userId is required');
  const limit = Math.min(Math.max(f.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const batch = f.category ? 200 : limit + 1;
  const maxBatches = f.category ? 10 : 1;
  const items: ReturnType<typeof toHistoryItem>[] = [];
  let cursor = f.cursor ?? null;
  let hasMore = false;
  let lastScanned: { createdAt: Date; id: string } | null = null;

  for (let i = 0; i < maxBatches && items.length <= limit; i++) {
    const and: Record<string, unknown>[] = [{ userId }];
    if (f.kind) and.push({ kind: f.kind });
    if (f.status) and.push(statusWhere(f.status, now));
    if (f.from) and.push({ createdAt: { gte: f.from } });
    if (f.to) and.push({ createdAt: { lte: f.to } });
    const cw = cursorWhere(cursor);
    if (cw) and.push(cw);
    const rows = (await prisma.approvalRequest.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: batch,
    })) as unknown as ApprovalRowLike[];
    for (const r of rows) {
      lastScanned = r;
      const item = toHistoryItem(r, now);
      if (f.category && item.category !== f.category) continue;
      items.push(item);
      if (items.length > limit) break;
    }
    if (rows.length < batch) break;
    cursor = { t: rows[rows.length - 1].createdAt, id: rows[rows.length - 1].id };
    if (i === maxBatches - 1) hasMore = true;
  }

  let truncated = false;
  if (items.length > limit) { hasMore = true; truncated = true; items.length = limit; }
  let nextCursor: string | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    if (truncated && last) nextCursor = encodeCursor({ createdAt: new Date(last.createdAt), id: last.id });
    else if (lastScanned) nextCursor = encodeCursor(lastScanned);
  }
  return { items, nextCursor };
}

export async function getApprovalHistoryItem(userId: string, id: string, now = new Date()) {
  if (!userId) throw new Error('approval history: userId is required');
  const row = (await prisma.approvalRequest.findFirst({ where: { id, userId } })) as unknown as ApprovalRowLike | null;
  if (!row) return null;
  const rows = await prisma.action.findMany({
    where: {
      userId,
      OR: [
        { validationResult: { contains: `"approvalId":"${id.replace(/[^A-Za-z0-9_-]/g, '')}"` } },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 200,
  });
  return { approval: toHistoryItem(row, now), ledger: rows.map(toLedgerItem) };
}

// ── ledger search ───────────────────────────────────────────────

export interface LedgerSearchFilter {
  q?: string; action?: string; status?: string; category?: ProtectedCategory; persona?: string; initiator?: string;
  correlationId?: string; from?: Date; to?: Date; cursor?: Cursor | null; limit?: number;
}

interface ActionRowLike {
  id: string; userId: string; initiator: string; persona: string | null; mambaMode: string | null; tool: string | null;
  action: string; permissionClass: string; confirmationMethod: string | null; inputSummary: string | null;
  outputSummary: string | null; validationResult: string | null; status: string; correlationId: string | null;
  latencyMs: number | null; createdAt: Date;
}

function parseMeta(vr: string | null): { protected: boolean; category: ProtectedCategory | null; approvalId: string | null } {
  if (!vr) return { protected: false, category: null, approvalId: null };
  try {
    const p = JSON.parse(vr) as Record<string, unknown>;
    const category = p?.category === 'money' || p?.category === 'proprietary' ? p.category : null;
    return {
      protected: p?.protected === true && category !== null,
      category: p?.protected === true ? category : null,
      approvalId: typeof p?.approvalId === 'string' ? p.approvalId.slice(0, 64) : null,
    };
  } catch {
    return { protected: false, category: null, approvalId: null };
  }
}

export function toLedgerItem(r: ActionRowLike) {
  const meta = parseMeta(r.validationResult);
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    action: r.action,
    tool: r.tool,
    status: r.status,
    persona: r.persona,
    mambaMode: r.mambaMode,
    initiator: r.initiator,
    permissionClass: r.permissionClass,
    confirmationMethod: r.confirmationMethod,
    inputSummary: redactText(r.inputSummary),
    outputSummary: redactText(r.outputSummary),
    correlationId: r.correlationId,
    latencyMs: r.latencyMs,
    protected: meta.protected,
    category: meta.category,
    approvalId: meta.approvalId,
  };
}

export async function searchLedger(userId: string, f: LedgerSearchFilter) {
  if (!userId) throw new Error('ledger search: userId is required');
  const limit = Math.min(Math.max(f.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const and: Record<string, unknown>[] = [{ userId }];
  if (f.q) {
    and.push({ OR: [
      { action: { contains: f.q, mode: 'insensitive' } },
      { inputSummary: { contains: f.q, mode: 'insensitive' } },
      { outputSummary: { contains: f.q, mode: 'insensitive' } },
    ] });
  }
  if (f.action) and.push({ action: f.action });
  if (f.status) and.push({ status: f.status });
  if (f.persona) and.push({ persona: f.persona });
  if (f.initiator) and.push({ initiator: f.initiator });
  if (f.correlationId) and.push({ correlationId: f.correlationId });
  // ledger.ts writes validationResult with JSON.stringify, so the pair has no spaces.
  if (f.category) and.push({ validationResult: { contains: `"category":"${f.category}"` } });
  if (f.from) and.push({ createdAt: { gte: f.from } });
  if (f.to) and.push({ createdAt: { lte: f.to } });
  const cw = cursorWhere(f.cursor ?? null);
  if (cw) and.push(cw);

  const rows = (await prisma.action.findMany({
    where: { AND: and },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  })) as unknown as ActionRowLike[];
  const page = rows.slice(0, limit);
  return {
    items: page.map(toLedgerItem),
    nextCursor: rows.length > limit && page.length ? encodeCursor(page[page.length - 1]) : null,
  };
}

export const FACET_WINDOW_DAYS = 90;

export async function ledgerFacets(userId: string, now = new Date()) {
  if (!userId) throw new Error('ledger facets: userId is required');
  const since = new Date(now.getTime() - FACET_WINDOW_DAYS * 86_400_000);
  const where = { userId, createdAt: { gte: since } };
  const [actions, statuses, personas, initiators, money, proprietary] = await Promise.all([
    prisma.action.groupBy({ by: ['action'], where, _count: { _all: true }, orderBy: { _count: { action: 'desc' } }, take: 200 }),
    prisma.action.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.action.groupBy({ by: ['persona'], where, _count: { _all: true } }),
    prisma.action.groupBy({ by: ['initiator'], where, _count: { _all: true } }),
    prisma.action.count({ where: { ...where, validationResult: { contains: '"category":"money"' } } }),
    prisma.action.count({ where: { ...where, validationResult: { contains: '"category":"proprietary"' } } }),
  ]);
  const toList = <K extends string>(rows: Array<Record<K, string | null> & { _count: { _all: number } }>, key: K) =>
    rows.map((r) => ({ value: r[key], count: r._count._all }));
  return {
    windowDays: FACET_WINDOW_DAYS,
    actions: toList(actions as never, 'action' as never),
    statuses: toList(statuses as never, 'status' as never),
    personas: toList(personas as never, 'persona' as never),
    initiators: toList(initiators as never, 'initiator' as never),
    categories: [
      { value: 'money', count: money },
      { value: 'proprietary', count: proprietary },
    ],
  };
}
