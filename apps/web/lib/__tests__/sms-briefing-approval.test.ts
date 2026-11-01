import { describe, it, expect, vi, beforeEach } from 'vitest';

const SID = 'AC' + 'a'.repeat(32);
const MSID = 'SM' + 'b'.repeat(32);
const TOKEN = 'tok-secret-123';
const OWN = '+14035550123';

type Row = Record<string, any>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('gt' in v) return row[k] > v.gt;
      if ('lte' in v) return row[k] <= v.lte;
      if ('lt' in v) return row[k] < v.lt;
      return true;
    }
    return row[k] === v;
  });
}

describe('sms_briefing_send approval gate', () => {
  let approvals: Row[];
  let ledgerRows: Row[];
  let pref: Row | null;
  const fetchMock = vi.fn();
  const logs: unknown[][] = [];

  beforeEach(() => {
    vi.resetModules();
    approvals = []; ledgerRows = []; logs.length = 0;
    pref = { userId: 'u1', channel: 'SMS', address: OWN, timeZone: 'America/Edmonton' };
    fetchMock.mockReset().mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: MSID, status: 'queued' }) });
    vi.stubGlobal('fetch', fetchMock);
    process.env.TWILIO_ACCOUNT_SID = SID;
    process.env.TWILIO_AUTH_TOKEN = TOKEN;
    process.env.TWILIO_FROM_NUMBER = '+15005550006';
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;

    const prisma = {
      approvalRequest: {
        create: async ({ data }: Row) => { const r = { id: `ap${approvals.length + 1}`, executedAt: null, ...data }; approvals.push(r); return r; },
        findFirst: async ({ where }: Row) => approvals.find((r) => matches(r, where)) ?? null,
        findMany: async ({ where }: Row) => approvals.filter((r) => matches(r, where)),
        updateMany: async ({ where, data }: Row) => {
          const hit = approvals.filter((r) => matches(r, where));
          hit.forEach((r) => Object.assign(r, data));
          return { count: hit.length };
        },
        deleteMany: async () => ({ count: 0 }),
        count: async ({ where }: Row) => approvals.filter((r) => matches(r, where)).length,
      },
      notificationPreference: { findFirst: async ({ where }: Row) => (pref && matches(pref, where) ? pref : null) },
      recommendation: { findMany: async () => [{ title: 'Call the bank about wire to Acme Corp' }], findFirst: async () => null, upsert: async () => ({}) },
      project: { findMany: async () => [{ id: 'p1', name: 'Alpha', status: 'ACTIVE' }] },
      conversation: { findFirst: async () => null },
    };
    vi.doMock('@/lib/db', () => ({ prisma }));
    vi.doMock('@/lib/ledger', () => ({
      recordAction: async (e: Row) => { ledgerRows.push(e); return { id: 'l' }; },
      recordActionSafe: async (e: Row) => { ledgerRows.push(e); return { id: 'l' }; },
      updateActionStatus: async () => true,
      countSecurityEvents: async () => ({ a: 2, b: 1 }),
      countToolExecutions: async () => 0,
    }));
    vi.doMock('@/lib/project-cards', () => ({
      listAccessibleProjects: async (uid: string) => { expect(uid).toBe('u1'); return [{ id: 'p1', name: 'Alpha', status: 'ACTIVE' }]; },
      statsForProjects: async () => new Map([['p1', { percent: 40 }]]),
    }));
    vi.doMock('@/lib/openclaw-client', () => ({ isGatewayConfigured: () => false, listOpenClawTools: vi.fn(), callOpenClawTool: vi.fn() }));
    const rec = (...a: unknown[]) => { logs.push(a); };
    vi.doMock('@/lib/logger', () => ({
      logger: { info: rec, warn: rec, error: rec, debug: rec, security: rec },
      generateCorrelationId: () => 'cid-1',
    }));
  });

  it('classifyProtected says sms_briefing_send and contact_message are protected', async () => {
    const { classifyProtected } = await import('../protected-actions');
    expect(classifyProtected({ toolName: 'sms_briefing_send' })).toMatchObject({ protected: true, category: 'proprietary' });
    expect(classifyProtected({ toolName: 'contact_message' })).toMatchObject({ protected: true });
  });

  it('requesting a briefing sends nothing, builds a short safe text and creates a Class C approval', async () => {
    const { requestSmsBriefing } = await import('../briefing/sms');
    const r = await requestSmsBriefing('u1', new Date('2026-10-26T15:00:00Z'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.preview.length).toBeLessThanOrEqual(600);
    expect(r.preview).toContain('Approvals pending: 0');
    expect(r.preview).toContain('Security events (24h): 3');
    expect(r.preview).toContain('Alpha 40%');
    expect(r.preview).not.toMatch(/\$\d/);
    expect(r.approval).toMatchObject({ tool: 'sms_briefing_send', permissionClass: 'C', protected: true, category: 'proprietary' });
    expect(r.approval.params).toMatchObject({ to: OWN, text: r.preview });
    expect(r.approval.summary).not.toContain(OWN);
    expect(new Date(r.approval.expiresAt).getTime() - new Date(r.approval.createdAt).getTime()).toBe(30_000);
    expect(ledgerRows.some((l) => l.action === 'approval_created' && l.protectedCategory === 'proprietary')).toBe(true);
  });

  it('returns no_sms_number (400) when the user has no SMS number', async () => {
    pref = null;
    const { requestSmsBriefing } = await import('../briefing/sms');
    expect(await requestSmsBriefing('u1')).toEqual({ ok: false, status: 400, error: 'no_sms_number' });
    pref = { userId: 'u1', channel: 'SMS', address: 'nope' };
    expect((await requestSmsBriefing('u1')).ok).toBe(false);
    expect(approvals).toHaveLength(0);
  });

  async function create() {
    const { requestSmsBriefing } = await import('../briefing/sms');
    const r = await requestSmsBriefing('u1');
    if (!r.ok) throw new Error('setup');
    return r;
  }

  it('sends exactly once after the owner approves by id, and ledgers with the category', async () => {
    const r = await create();
    const { decide } = await import('../approvals');
    const out = await decide('u1', r.approvalId, 'approve');
    expect(out.status).toBe('EXECUTED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('Body')).toBe(r.preview);
    const again = await decide('u1', r.approvalId, 'approve');
    expect(again.status).toBe('ALREADY_DECIDED');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = ledgerRows.find((l) => l.action === 'sms_briefing_sent');
    expect(sent).toMatchObject({ protectedCategory: 'proprietary', userId: 'u1' });
    for (const l of ledgerRows) if (l.action.startsWith('approval_') ) expect(l.protectedCategory).toBe('proprietary');
  });

  it('nothing is sent without an approval, on deny, or after expiry', async () => {
    const r = await create();
    expect(fetchMock).not.toHaveBeenCalled();
    const { decide } = await import('../approvals');
    expect((await decide('u1', r.approvalId, 'deny')).status).toBe('DENIED');
    expect((await decide('u1', r.approvalId, 'approve')).status).toBe('ALREADY_DECIDED');
    const r2 = await create();
    const late = () => new Date(Date.now() + 31_000);
    expect((await decide('u1', r2.approvalId, 'approve', { now: late })).status).toBe('EXPIRED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a bare or bulk id approves nothing', async () => {
    await create();
    const { decide } = await import('../approvals');
    expect((await decide('u1', 'all', 'approve')).status).toBe('NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changing the briefing text after approval creation prevents the send (hash lock)', async () => {
    const r = await create();
    approvals[0].params = { ...approvals[0].params, text: 'Wire $50,000 to Acme' };
    const { decide } = await import('../approvals');
    const out = await decide('u1', r.approvalId, 'approve');
    expect(out.status).toBe('FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('even with a re-hashed row, text that fails its own textHash is not sent', async () => {
    const { runApprovedSmsBriefing } = await import('../briefing/sms');
    const res = await runApprovedSmsBriefing('u1', { to: OWN, text: 'changed', textHash: 'deadbeef' });
    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a changed SMS number since approval prevents the send', async () => {
    const r = await create();
    pref = { ...pref, address: '+14035559999' };
    const { decide } = await import('../approvals');
    const out = await decide('u1', r.approvalId, 'approve');
    expect(out.status).toBe('FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("another user's approval id gives NOT_FOUND and sends nothing", async () => {
    const r = await create();
    const { decide } = await import('../approvals');
    const out = await decide('u2', r.approvalId, 'approve');
    expect(out.status).toBe('NOT_FOUND');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(approvals[0].status).toBe('PENDING');
  });

  it('Twilio failure is reported plainly and not retried; secrets never reach ledger or logs', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: 21608, message: `trial ${TOKEN} ${OWN}` }) });
    const r = await create();
    const { decide } = await import('../approvals');
    const out = await decide('u1', r.approvalId, 'approve');
    expect(out.status).toBe('FAILED');
    expect(out.result?.error).toContain('unverified_number_trial');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const blob = JSON.stringify([ledgerRows.filter((l) => l.action !== 'approval_created' && l.action !== 'sms_briefing_requested'), logs, out]);
    expect(blob).not.toContain(TOKEN);
    expect(blob).not.toContain('4035550123');
    expect(blob).not.toContain(r.preview.split('\n')[1]);
    expect(JSON.stringify(ledgerRows)).not.toContain('4035550123');
    expect(JSON.stringify(ledgerRows)).not.toContain(r.preview.split('\n')[1]);
  });

  it('not_configured is reported as such', async () => {
    delete process.env.TWILIO_AUTH_TOKEN;
    const r = await create();
    const { decide } = await import('../approvals');
    const out = await decide('u1', r.approvalId, 'approve');
    expect(out.status).toBe('FAILED');
    expect(out.result?.error).toContain('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the automated daily path never calls fetch and surfaces a reminder only', async () => {
    const { surfaceBriefingWaiting } = await import('../briefing/sms');
    expect(await surfaceBriefingWaiting('u1', '2026-10-26')).toBe('created');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ledgerRows.at(-1)).toMatchObject({ action: 'sms_briefing_waiting_for_approval', status: 'AWAITING_APPROVAL' });
  });

  it('the model path cannot send directly: sms_briefing_send via executeTool is Class C and queues an approval', async () => {
    const { executeTool } = await import('../tool-registry');
    const res = await executeTool('u1', 'sms_briefing_send', { to: OWN, text: 'hi', textHash: 'x' });
    expect(res.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
