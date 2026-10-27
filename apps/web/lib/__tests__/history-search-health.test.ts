import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';

type Row = Record<string, any>;

// Tiny in-memory evaluator for the Prisma where shapes used by lib/ledger-search.ts.
function match(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'AND') return (v as Row[]).every((w) => match(row, w));
    if (k === 'OR') return (v as Row[]).some((w) => match(row, w));
    const x = row[k];
    if (v instanceof Date) return x instanceof Date && x.getTime() === v.getTime();
    if (v && typeof v === 'object') {
      const o = v as Row;
      if ('in' in o && !o.in.includes(x)) return false;
      if ('contains' in o) {
        if (typeof x !== 'string') return false;
        const [a, b] = o.mode === 'insensitive' ? [x.toLowerCase(), String(o.contains).toLowerCase()] : [x, o.contains];
        if (!a.includes(b)) return false;
      }
      if ('lt' in o && !(x < o.lt)) return false;
      if ('lte' in o && !(x <= o.lte)) return false;
      if ('gt' in o && !(x > o.gt)) return false;
      if ('gte' in o && !(x >= o.gte)) return false;
      return true;
    }
    return x === v;
  });
}
function table(rows: Row[]) {
  return {
    findMany: vi.fn(async ({ where, orderBy, take }: any) => {
      const out = rows.filter((r) => match(r, where ?? {}));
      out.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
      void orderBy;
      return out.slice(0, take ?? out.length);
    }),
    findFirst: vi.fn(async ({ where }: any) => rows.find((r) => match(r, where)) ?? null),
    count: vi.fn(async ({ where }: any) => rows.filter((r) => match(r, where)).length),
    groupBy: vi.fn(async ({ by, where }: any) => {
      const m = new Map<any, number>();
      rows.filter((r) => match(r, where)).forEach((r) => m.set(r[by[0]], (m.get(r[by[0]]) ?? 0) + 1));
      return [...m].map(([v, n]) => ({ [by[0]]: v, _count: { _all: n } }));
    }),
  };
}

const T0 = new Date('2026-10-20T12:00:00.000Z').getTime();
const approvals: Row[] = [];
const actions: Row[] = [];
const prismaMock: any = { approvalRequest: table(approvals), action: table(actions), $queryRaw: vi.fn() };

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

const ar = (i: number, over: Row = {}): Row => ({
  id: `ap${String(i).padStart(3, '0')}`, userId: 'A', kind: 'tool_call', tool: 'web_search', params: {}, summary: 's',
  permissionClass: 'C', status: 'EXECUTED', correlationId: `c${i}`, conversationId: null, persona: 'WHINK',
  createdAt: new Date(T0 - i * 1000), expiresAt: new Date(T0 - i * 1000 + 30_000), decidedAt: new Date(T0), executedAt: new Date(T0),
  result: null, contentHash: 'HASH', ...over,
});
const ac = (i: number, over: Row = {}): Row => ({
  id: `ac${String(i).padStart(3, '0')}`, userId: 'A', initiator: 'system', persona: 'WHINK', mambaMode: null, tool: null,
  action: 'tool_executed', permissionClass: 'A', confirmationMethod: null, inputSummary: 'did a thing', outputSummary: null,
  validationResult: null, status: 'VALIDATED', correlationId: `c${i}`, latencyMs: 5, createdAt: new Date(T0 - i * 1000), ...over,
});

beforeEach(() => {
  approvals.length = 0;
  actions.length = 0;
  vi.clearAllMocks();
});

describe('approval history', () => {
  it('is tenant scoped: B never sees A rows and A ids are 404 for B', async () => {
    const m = await import('../ledger-search');
    approvals.push(ar(1, { userId: 'A' }), ar(2, { userId: 'B' }));
    expect((await m.listApprovalHistory('B', {})).items.map((i) => i.id)).toEqual(['ap002']);
    expect(await m.getApprovalHistoryItem('B', 'ap001')).toBeNull();
    expect(await m.getApprovalHistoryItem('A', 'ap001')).not.toBeNull();
    for (const call of prismaMock.approvalRequest.findMany.mock.calls) expect(JSON.stringify(call[0].where)).toContain('"userId"');
  });

  it('pages stably with no gaps or repeats, including equal createdAt', async () => {
    const m = await import('../ledger-search');
    for (let i = 0; i < 7; i++) approvals.push(ar(i, { createdAt: new Date(T0 - Math.floor(i / 2) * 1000) }));
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let n = 0; n < 5; n++) {
      const page: any = await m.listApprovalHistory('A', { limit: 3, cursor: cursor ? m.decodeCursor(cursor) : null });
      seen.push(...page.items.map((i: any) => i.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    expect(m.decodeCursor('not-a-cursor')).toBeNull();
  });

  it('filters by status (pending past expiry shows EXPIRED), kind and category', async () => {
    const m = await import('../ledger-search');
    const now = new Date(T0 + 60_000);
    approvals.push(
      ar(1, { status: 'PENDING', createdAt: new Date(T0 - 1000), expiresAt: new Date(T0 + 29_000) }),
      ar(2, { status: 'DENIED' }),
      ar(3, { status: 'EXPIRED', kind: 'ear', tool: null }),
      ar(4, { status: 'EXECUTING' }),
      ar(5, { tool: 'email_send', status: 'EXECUTED' }),
    );
    const ids = async (f: any) => (await m.listApprovalHistory('A', f, now)).items.map((i) => i.id).sort();
    expect(await ids({ status: 'EXPIRED' })).toEqual(['ap001', 'ap003']);
    expect(await ids({ status: 'DENIED' })).toEqual(['ap002']);
    expect(await ids({ status: 'APPROVED' })).toEqual(['ap004']);
    expect(await ids({ status: 'AWAITING_APPROVAL' }, )).toEqual([]);
    expect(await ids({ kind: 'ear' })).toEqual(['ap003']);
    expect(await ids({ category: 'proprietary' })).toEqual(['ap005']);
    expect(await ids({ from: new Date(T0 - 2500) })).toEqual(['ap001', 'ap002']);
  });

  it('carries protected flag and category computed with params, and strips secrets', async () => {
    const m = await import('../ledger-search');
    approvals.push(ar(1, {
      tool: 'email_send',
      params: { to: 'x@y.z', apiKey: 'abc', nested: { Authorization: 'Bearer q', password: 'p', ok: 'fine' }, note: 'sk-ant-' + 'a'.repeat(30) },
      result: { token: 'zzz', msg: 'done' },
    }));
    const [item] = (await m.listApprovalHistory('A', {})).items;
    expect(item.protected).toBe(true);
    expect(item.category).toBe('proprietary');
    expect(item.tool).toBe('email_send');
    const s = JSON.stringify(item);
    for (const bad of ['"abc"', 'Bearer q', '"p"', 'zzz', 'HASH', 'sk-ant-']) expect(s).not.toContain(bad);
    expect(s).toContain('fine');
    expect(item.decidedBy).toBe('A');
    expect(item).not.toHaveProperty('contentHash');
    expect(item).not.toHaveProperty('confirmationCode');
  });

  it('detail adds the ledger trail scoped to the user', async () => {
    const m = await import('../ledger-search');
    approvals.push(ar(1));
    actions.push(
      ac(1, { validationResult: JSON.stringify({ approvalId: 'ap001' }) }),
      ac(2, { userId: 'B', validationResult: JSON.stringify({ approvalId: 'ap001' }) }),
      ac(3, { validationResult: JSON.stringify({ approvalId: 'other' }) }),
    );
    const d = await m.getApprovalHistoryItem('A', 'ap001');
    expect(d?.ledger.map((l) => l.id)).toEqual(['ac001']);
  });
});

describe('ledger search', () => {
  it('is tenant scoped and rejects a missing user id', async () => {
    const m = await import('../ledger-search');
    actions.push(ac(1), ac(2, { userId: 'B' }));
    expect((await m.searchLedger('B', {})).items.map((i) => i.id)).toEqual(['ac002']);
    await expect(m.searchLedger('', {})).rejects.toThrow();
    expect((await m.ledgerFacets('B')).statuses).toEqual([{ value: 'VALIDATED', count: 1 }]);
  });

  it('filters correctly and q only matches action and summaries, case-insensitively', async () => {
    const m = await import('../ledger-search');
    actions.push(
      ac(1, { action: 'Memory_Written', inputSummary: 'alpha' }),
      ac(2, { action: 'tool_executed', outputSummary: 'Contains ALPHA here', status: 'FAILED', persona: 'MAMBA' }),
      ac(3, { action: 'tool_executed', tool: 'alpha_tool', correlationId: 'zzz', initiator: 'user' }),
    );
    const ids = async (f: any) => (await m.searchLedger('A', f)).items.map((i) => i.id).sort();
    expect(await ids({ q: 'alpha' })).toEqual(['ac001', 'ac002']);
    expect(await ids({ q: 'memory_w' })).toEqual(['ac001']);
    expect(await ids({ status: 'FAILED' })).toEqual(['ac002']);
    expect(await ids({ persona: 'MAMBA' })).toEqual(['ac002']);
    expect(await ids({ initiator: 'user' })).toEqual(['ac003']);
    expect(await ids({ correlationId: 'zzz' })).toEqual(['ac003']);
    expect(await ids({ action: 'tool_executed', status: 'FAILED' })).toEqual(['ac002']);
  });

  it('exposes the protected category from validationResult, filters on it, and redacts', async () => {
    const m = await import('../ledger-search');
    actions.push(
      ac(1, { validationResult: JSON.stringify({ approvalId: 'a1', protected: true, category: 'money' }), inputSummary: 'key sk-ant-' + 'b'.repeat(30) }),
      ac(2),
    );
    const res = await m.searchLedger('A', { category: 'money' });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ protected: true, category: 'money', approvalId: 'a1', inputSummary: '[redacted]' });
    expect(res.items[0]).not.toHaveProperty('validationResult');
    expect((await m.ledgerFacets('A')).categories).toEqual([{ value: 'money', count: 1 }, { value: 'proprietary', count: 0 }]);
  });

  it('paginates stably', async () => {
    const m = await import('../ledger-search');
    for (let i = 0; i < 5; i++) actions.push(ac(i, { createdAt: new Date(T0) }));
    const p1 = await m.searchLedger('A', { limit: 2 });
    const p2 = await m.searchLedger('A', { limit: 2, cursor: m.decodeCursor(p1.nextCursor!) });
    const p3 = await m.searchLedger('A', { limit: 2, cursor: m.decodeCursor(p2.nextCursor!) });
    const all = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    expect(new Set(all).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
  });
});

describe('routes', () => {
  const auth = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset().mockResolvedValue({ user: { id: 'A', email: 'a@x.test' } });
    vi.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
    }));
    vi.doMock('@/auth', () => ({ auth }));
    vi.doMock('@/lib/db', () => ({ prisma: prismaMock }));
  });
  const req = (qs: string) => ({ url: `http://x/api?${qs}` }) as never;

  it('401 without a session, 400 on bad input, 200 on the happy path', async () => {
    const { GET } = await import('../../app/api/approvals/history/route');
    const { GET: SEARCH } = await import('../../app/api/ledger/search/route');
    approvals.push(ar(1));
    actions.push(ac(1));
    expect((await GET(req('limit=5'))).status).toBe(200);
    expect((await GET(req('limit=1000'))).status).toBe(400);
    expect((await GET(req('status=NOPE'))).status).toBe(400);
    expect((await GET(req('cursor=garbage'))).status).toBe(400);
    expect((await GET(req('bogus=1'))).status).toBe(400);
    expect((await SEARCH(req('q=thing'))).status).toBe(200);
    expect((await SEARCH(req('from=notadate'))).status).toBe(400);
    auth.mockResolvedValue(null);
    expect((await GET(req(''))).status).toBe(401);
    expect((await SEARCH(req(''))).status).toBe(401);
    const { GET: FACETS } = await import('../../app/api/ledger/search/facets/route');
    expect((await FACETS()).status).toBe(401);
  });

  it('detail route returns 404 for another user and for unknown ids', async () => {
    approvals.push(ar(1, { userId: 'B' }));
    const { GET } = await import('../../app/api/approvals/history/[id]/route');
    expect((await GET({} as never, { params: Promise.resolve({ id: 'ap001' }) })).status).toBe(404);
    approvals.push(ar(2, { userId: 'A' }));
    expect((await GET({} as never, { params: Promise.resolve({ id: 'ap002' }) })).status).toBe(200);
  });
});

describe('system health', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    for (const k of ['OLLAMA_URL', 'OPENCLAW_URL', 'ANYTHINGLLM_URL', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'WHINK_OWNER_EMAILS']) delete process.env[k];
  });
  const mocks = (o: { ollama?: () => Promise<boolean>; tools?: () => Promise<unknown[]>; ws?: () => Promise<unknown[]> } = {}) => {
    vi.doMock('@/lib/db', () => ({ prisma: prismaMock }));
    vi.doMock('@/lib/offline', () => ({ ollamaReachable: o.ollama ?? (async () => true) }));
    vi.doMock('@/lib/openclaw-client', () => ({
      isGatewayConfigured: () => Boolean(process.env.OPENCLAW_URL),
      listOpenClawTools: o.tools ?? (async () => [{}, {}]),
    }));
    vi.doMock('@/lib/anythingllm-client', () => ({
      isAnythingLlmConfigured: () => Boolean(process.env.ANYTHINGLLM_URL),
      listWorkspaces: o.ws ?? (async () => [{ slug: 'w' }]),
    }));
    vi.doMock('@/lib/model-router', () => ({
      configuredCloudModels: () => [process.env.ANTHROPIC_API_KEY ? 'claude' : null].filter(Boolean),
    }));
  };

  it('probes degrade to down/unknown on throw or timeout, never throw, and run in parallel', async () => {
    process.env.OLLAMA_URL = 'http://localhost:11434';
    process.env.OPENCLAW_URL = 'http://127.0.0.1:9';
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:9';
    mocks({
      ollama: () => new Promise<boolean>(() => {}),
      tools: async () => { throw new Error('boom secret=hunter2'); },
      ws: () => new Promise<unknown[]>(() => {}),
    });
    prismaMock.$queryRaw.mockRejectedValue(new Error('db down'));
    const h = await import('../system-health');
    h.__resetHealthCache();
    const t = Date.now();
    const r = await h.operatorHealth();
    expect(Date.now() - t).toBeLessThan(3000);
    expect(r.checks.database.status).toBe('down');
    expect(r.checks.localModel).toMatchObject({ status: 'down', detail: 'timeout' });
    expect(r.checks.gateway.status).toBe('down');
    expect(r.checks.recall.status).toBe('down');
    expect(r.checks.worker.status).toBe('unknown');
    expect(r.checks.migrations.status).toBe('unknown');
    expect(JSON.stringify(r)).not.toContain('hunter2');
  });

  it('reports configured providers by name only, not_configured otherwise, and caches for 10 s', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-' + 'z'.repeat(40);
    mocks();
    prismaMock.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const q = strings.join('?');
      if (q.includes('_prisma_migrations')) return [{ n: 3n }];
      if (q.includes('to_regclass')) return [{ t: null }];
      return [{ '?column?': 1 }];
    });
    const h = await import('../system-health');
    h.__resetHealthCache();
    const r = await h.operatorHealth(1_000);
    expect(r.checks.modelProviders).toMatchObject({ status: 'ok', providers: ['claude'] });
    expect(JSON.stringify(r)).not.toContain('sk-ant-');
    expect(r.checks.gateway.status).toBe('not_configured');
    expect(r.checks.recall.status).toBe('not_configured');
    expect(r.checks.localModel.status).toBe('not_configured');
    expect(r.checks.worker).toMatchObject({ status: 'unknown' });
    expect(r.checks.migrations.applied).toBe(3);
    const calls = prismaMock.$queryRaw.mock.calls.length;
    expect(await h.operatorHealth(5_000)).toBe(r);
    expect(prismaMock.$queryRaw.mock.calls.length).toBe(calls);
    expect(await h.operatorHealth(12_000)).not.toBe(r);
  });

  it('route: owner gets operator facts, non-owner only the user scope, 401 without session', async () => {
    mocks();
    prismaMock.$queryRaw.mockResolvedValue([{ n: 1 }]);
    const auth = vi.fn().mockResolvedValue({ user: { id: 'A', email: 'owner@x.test' } });
    vi.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
    }));
    vi.doMock('@/auth', () => ({ auth }));
    process.env.WHINK_OWNER_EMAILS = 'owner@x.test';
    const { GET } = await import('../../app/api/system/health/route');
    const h = await import('../system-health');
    h.__resetHealthCache();
    const owner = await (await GET()).json();
    expect(owner.scope).toBe('operator');
    expect(Object.keys(owner.checks)).toContain('gateway');
    auth.mockResolvedValue({ user: { id: 'B', email: 'other@x.test' } });
    const user = await (await GET()).json();
    expect(user.scope).toBe('user');
    expect(Object.keys(user.checks)).toEqual(['database']);
    expect(JSON.stringify(user)).not.toMatch(/latencyMs|providers|migrations/);
    auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});

describe('boundary greps stay clean', () => {
  const grep = (pattern: string, dirs: string) => {
    try {
      return execSync(`grep -rlE "${pattern}" ${dirs} --include=*.ts --include=*.tsx --exclude-dir=__tests__`, { cwd: process.cwd(), encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    } catch { return []; }
  };
  it('C4: only openclaw-client knows the transport', () => {
    expect(grep('OPENCLAW_URL|@modelcontextprotocol', 'app lib').filter((f) => !f.endsWith('lib/openclaw-client.ts')).filter((f) => f.includes('system-health') || f.includes('ledger-search') || f.includes('app/api/system') || f.includes('history'))).toEqual([]);
  });
  it('C3: only anythingllm-client knows the transport', () => {
    expect(grep('ANYTHINGLLM_URL|ANYTHINGLLM_API_KEY|/api/v1/workspace', 'app lib').filter((f) => f.includes('system-health') || f.includes('ledger-search') || f.includes('app/api/system') || f.includes('history'))).toEqual([]);
  });
  it('A1: no direct ledger writes in the new files', () => {
    expect(grep('prisma\\.action\\.(create|update|upsert|delete)', 'lib/ledger-search.ts lib/system-health.ts app/api/system app/api/ledger app/api/approvals')).toEqual([]);
  });
});
