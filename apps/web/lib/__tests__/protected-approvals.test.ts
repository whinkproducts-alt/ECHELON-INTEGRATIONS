/**
 * Protected actions through gateway registration, approvals, chat phrases and manifests.
 * In-memory approval store; the permission engine is real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defHash } from '@/lib/tool-definition';
import { validateManifest } from '@/lib/connectors/manifest';
import { isApprovalMessage } from '@/lib/approval-handler';
import { classifySpokenDecision } from '@/lib/spoken-approval';

interface Row {
  id: string; userId: string; kind: string; tool: string | null; params: unknown; contentHash: string;
  summary: string; permissionClass: string; status: string; correlationId: string; conversationId: string | null;
  persona: string; createdAt: Date; expiresAt: Date; decidedAt: Date | null; executedAt: Date | null; result: unknown;
}
type Where = { id?: string; userId?: string; status?: string; executedAt?: null; expiresAt?: { gt?: Date; lte?: Date }; decidedAt?: { lt?: Date } };
function matches(r: Row, w: Where): boolean {
  if (w.id !== undefined && r.id !== w.id) return false;
  if (w.userId !== undefined && r.userId !== w.userId) return false;
  if (w.status !== undefined && r.status !== w.status) return false;
  if (w.expiresAt?.gt && !(r.expiresAt.getTime() > w.expiresAt.gt.getTime())) return false;
  if (w.expiresAt?.lte && !(r.expiresAt.getTime() <= w.expiresAt.lte.getTime())) return false;
  if (w.executedAt === null && r.executedAt !== null) return false;
  if (w.decidedAt?.lt && !(r.decidedAt && r.decidedAt.getTime() < w.decidedAt.lt.getTime())) return false;
  return true;
}

const T0 = new Date('2026-10-25T12:00:00.000Z');
const at = (ms: number) => () => new Date(T0.getTime() + ms);
const TOOL = 'openclaw__itest__post';
const DEF = { description: 'd', inputSchema: {} };

describe('protected actions: gateway, approvals, chat', () => {
  let rows: Row[];
  let ledgerRows: Array<Record<string, any>>;
  let handler: ReturnType<typeof vi.fn>;
  let securityLog: ReturnType<typeof vi.fn>;
  let seq: number;

  async function setup(opts: { allowList?: 'A' | 'B' } = {}) {
    vi.resetModules();
    process.env.OPENCLAW_ALLOWED_USER_IDS = 'u1,u2';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    rows = []; ledgerRows = []; seq = 0;
    handler = vi.fn().mockResolvedValue({ posted: true });
    securityLog = vi.fn();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.doMock('@/config/tool-classes.json', () => ({
      default: opts.allowList ? { [TOOL]: { class: opts.allowList, defHash: defHash(DEF) } } : {},
    }));
    vi.doMock('@/lib/logger', () => ({
      generateCorrelationId: () => 'cid',
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), security: securityLog },
    }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        approvalRequest: {
          create: async ({ data }: { data: Partial<Row> }) => {
            const r = { decidedAt: null, executedAt: null, result: null, params: null, ...data, id: `ap${++seq}` } as Row;
            rows.push(r); return { ...r };
          },
          findFirst: async ({ where }: { where: Where }) => { const r = rows.find((x) => matches(x, where)); return r ? { ...r } : null; },
          findMany: async ({ where }: { where: Where }) => rows.filter((x) => matches(x, where)).map((x) => ({ ...x })),
          updateMany: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
            let count = 0;
            for (const r of rows) if (matches(r, where)) { Object.assign(r, data); count++; }
            return { count };
          },
          deleteMany: async ({ where }: { where: Where }) => { rows = rows.filter((r) => !matches(r, where)); return { count: 1 }; },
        },
        userProfile: { findUnique: async () => ({ autonomyLevel: 4 }) },
        delegation: { findFirst: async () => ({ id: 'd1' }) },
        userDelegation: { findFirst: async () => ({ id: 'd1' }) },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({
      recordAction: async (e: Record<string, any>) => { ledgerRows.push(e); return { id: `l${ledgerRows.length}` }; },
      recordActionSafe: async (e: Record<string, any>) => { ledgerRows.push(e); return { id: `l${ledgerRows.length}` }; },
      updateActionStatus: async () => true,
    }));
    vi.doMock('@/lib/openclaw-client', () => ({
      isGatewayConfigured: () => true,
      listOpenClawTools: async () => [{ name: 'itest__post', ...DEF }],
      callOpenClawTool: handler,
    }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
    const registry = await import('../tool-registry');
    await registry.registerOpenClawTools('u1');
    const approvals = await import('../approvals');
    return { registry, approvals };
  }

  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const metaOf = (l: Record<string, any>) => JSON.parse(l.validationResult ?? '{}');

  it('an allow-list entry cannot lower a protected tool: Class A entry is ignored, logged, and the call still waits', async () => {
    for (const cls of ['A', 'B'] as const) {
      const { registry } = await setup({ allowList: cls });
      expect(securityLog).toHaveBeenCalledWith('protected_allowlist_entry_ignored', expect.objectContaining({ tool: TOOL }));
      const res = await registry.executeTool('u1', TOOL, { text: 'hello' }, 'WHINK', undefined, 'cid-1');
      expect(res.approvalRequired).toBeDefined();
      expect(handler).not.toHaveBeenCalled();
      expect(res.approvalRequired?.permissionClass).toBe('C');
    }
  });

  it('a protected approval carries protected and category; every state change ledger row includes the category', async () => {
    const { registry, approvals } = await setup();
    const a = (await registry.executeTool('u1', TOOL, { text: 'hi' }, 'MAMBA', undefined, 'cid-1')).approvalRequired!;
    expect(a.protected).toBe(true);
    expect(a.category).toBe('proprietary');
    const created = ledgerRows.find((l) => l.action === 'approval_created')!;
    expect(metaOf(created)).toMatchObject({ approvalId: a.id, protected: true, category: 'proprietary' });

    const out = await approvals.decide('u1', a.id, 'approve', { now: at(1000) });
    expect(out.status).toBe('EXECUTED');
    for (const action of ['approval_approved', 'approval_executed']) {
      expect(metaOf(ledgerRows.find((l) => l.action === action)!)).toMatchObject({ protected: true, category: 'proprietary' });
    }
  });

  it('denied and expired protected requests are ledgered with the category', async () => {
    const { registry, approvals } = await setup();
    const a = (await registry.executeTool('u1', TOOL, { text: 'a' }, 'WHINK', undefined, 'c1')).approvalRequired!;
    await approvals.decide('u1', a.id, 'deny', { now: at(1000) });
    expect(metaOf(ledgerRows.find((l) => l.action === 'approval_denied')!)).toMatchObject({ protected: true, category: 'proprietary' });
    const b = (await registry.executeTool('u1', TOOL, { text: 'b' }, 'WHINK', undefined, 'c2')).approvalRequired!;
    await approvals.decide('u1', b.id, 'approve', { now: at(30_100) });
    expect(metaOf(ledgerRows.find((l) => l.action === 'approval_expired')!)).toMatchObject({ protected: true, category: 'proprietary' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('another user cannot approve or deny the owner\'s protected request', async () => {
    const { registry, approvals } = await setup();
    const a = (await registry.executeTool('u1', TOOL, { text: 'hi' }, 'WHINK', undefined, 'c1')).approvalRequired!;
    expect((await approvals.decide('u2', a.id, 'approve', { now: at(1000) })).status).toBe('NOT_FOUND');
    expect((await approvals.decide('u2', a.id, 'deny', { now: at(1000) })).status).toBe('NOT_FOUND');
    expect(rows[0].status).toBe('PENDING');
    expect(handler).not.toHaveBeenCalled();
    expect(ledgerRows.some((l) => l.action === 'SECURITY_EVENT: approval_not_found' && l.userId === 'u2')).toBe(true);
  });

  it('approve-all forms are refused: wildcard ids approve nothing', async () => {
    const { registry, approvals } = await setup();
    await registry.executeTool('u1', TOOL, { text: 'hi' }, 'WHINK', undefined, 'c1');
    for (const id of ['all', '*', 'ALL', 'ap1,ap2', 'ap1 ap2', '', 'everything']) {
      expect((await approvals.decide('u1', id, 'approve', { now: at(1000) })).status).toBe('NOT_FOUND');
    }
    expect(rows[0].status).toBe('PENDING');
    expect(handler).not.toHaveBeenCalled();
    expect(ledgerRows.some((l) => l.action === 'SECURITY_EVENT: bulk_approval_refused')).toBe(true);
  });

  it('chat phrases for bulk, standing or bare approval are detected and approve nothing', () => {
    for (const m of ['approved', 'approve all', 'Approve everything', 'always approve payments', 'auto-approve', 'approve payments from now on', 'please approve all pending']) {
      expect(isApprovalMessage(m)).toBe(true);
    }
    expect(isApprovalMessage('what is on my calendar this week')).toBe(false);
  });

  it('spoken: a bare "approved" or "approve all" approves nothing; the code is still required', () => {
    expect(classifySpokenDecision('approved', 0.99, '4719')).toBe('unclear');
    expect(classifySpokenDecision('approve', 0.99, '4719')).toBe('unclear');
    expect(classifySpokenDecision('approve all', 0.99, '4719')).toBe('unclear');
    expect(classifySpokenDecision('approved 4719', 0.99, '4719')).toBe('approve');
  });
});

describe('connector manifests and protected capabilities', () => {
  const base = {
    id: 'mail', name: 'Mail', version: '1.0.0', publisher: 'Acme', license: 'MIT', kind: 'oauth' as const,
    capabilities: ['email_read', 'email_send'], endpoints: [], scopes: [],
  };

  it.each(['A', 'B'])('a protected capability declared as Class %s is a validation error', (permissionClass) => {
    const r = validateManifest({ ...base, permissionClass });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('email_send');
    expect(r.errors.join(' ')).toMatch(/cannot be declared below Class C/);
  });

  it('a protected capability declared as Class C is valid; read-only capabilities may be lower', () => {
    expect(validateManifest({ ...base, permissionClass: 'C' }).valid).toBe(true);
    expect(validateManifest({ ...base, capabilities: ['email_read'], permissionClass: 'A' }).valid).toBe(true);
  });

  it('a protected tool in a manifest cannot be declared below Class C', () => {
    const r = validateManifest({ ...base, capabilities: [], permissionClass: 'B', tools: [{ name: 'refund_customer', description: 'Refund a charge' }] });
    expect(r.valid).toBe(false);
    expect(r.effectiveClass).toBe('C');
  });
});
