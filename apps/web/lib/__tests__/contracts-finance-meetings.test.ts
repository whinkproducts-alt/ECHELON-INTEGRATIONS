import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { db, resetDb } from './helpers/mock-db';

vi.mock('@/lib/db', () => ({ prisma: db }));
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'l1' });
vi.mock('@/lib/ledger', () => ({ recordActionSafe: (e: unknown) => recordActionSafe(e), recordAction: vi.fn(), writeLedger: vi.fn() }));

import { ContractInputSchema, ContractPatchSchema, ListQuerySchema, createContract, updateContract, listContracts, getContract, deleteContract } from '../contracts/service';
import { combineContractValue, financeSummary, formatCents, toCents } from '../finance/summary';
import { createRoom, newRoomName, providerBase } from '../meetings/provider';
import { classifyProtected } from '../protected-actions';

const dec = (s: string) => ({ toFixed: () => s });
const crow = (o: Record<string, unknown> = {}) => ({
  id: 'k1', userId: 'uA', title: 'MSA', counterparty: 'Acme', subsidiary: 'consult', projectId: null, valueAmount: dec('1000.50'), currency: 'CAD', status: 'ACTIVE',
  startDate: null, endDate: null, renewalDate: null, notes: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), ...o,
});

beforeEach(() => { resetDb(); recordActionSafe.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('contracts', () => {
  it('contract capabilities are Class A and not protected (records only)', () => {
    for (const c of ['contract_create', 'contract_update']) expect(classifyProtected({ toolName: c, capability: c }).protected).toBe(false);
  });
  it('validation: strict keys, subsidiary id, money format, currency, dates', () => {
    const ok = { title: 'T', counterparty: 'C' };
    expect(ContractInputSchema.safeParse(ok).success).toBe(true);
    expect(ContractInputSchema.safeParse({ ...ok, userId: 'x' }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...ok, subsidiary: 'nope' }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...ok, subsidiary: 'trades' }).success).toBe(true);
    expect(ContractInputSchema.safeParse({ ...ok, valueAmount: '10.123' }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...ok, valueAmount: -1 }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...ok, valueAmount: 10.1 }).success).toBe(true);
    expect(ContractInputSchema.parse({ ...ok, valueAmount: 10.1 }).valueAmount).toBe('10.10');
    expect(ContractInputSchema.safeParse({ ...ok, currency: 'cad' }).success).toBe(true);
    expect(ContractInputSchema.safeParse({ ...ok, currency: 'DOLLARS' }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...ok, startDate: '2026-02-01', endDate: '2026-01-01' }).success).toBe(false);
    expect(ContractInputSchema.safeParse({ ...ok, status: 'PAID' }).success).toBe(false);
    expect(ContractPatchSchema.safeParse({}).success).toBe(false);
    expect(ListQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });
  it('create with another user\'s project: 404 outcome, nothing written', async () => {
    db.project.findFirst.mockResolvedValue(null);
    const r = await createContract('uA', ContractInputSchema.parse({ title: 'T', counterparty: 'C', projectId: 'pOther' }));
    expect(r).toMatchObject({ ok: true, value: { kind: 'project_not_found' } });
    expect(db.contract.create).not.toHaveBeenCalled();
    const where = db.project.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('pOther');
    expect(JSON.stringify(where)).toContain('uA');
  });
  it('create writes userId from the session and ledgers without notes or counterparty text', async () => {
    db.contract.create.mockResolvedValue(crow());
    const r = await createContract('uA', ContractInputSchema.parse({ title: 'T', counterparty: 'Secret Corp', valueAmount: '1000.50' }));
    expect(r).toMatchObject({ ok: true, value: { kind: 'ok', value: { valueAmount: '1000.50' } } });
    expect(db.contract.create.mock.calls[0][0].data.userId).toBe('uA');
    expect(JSON.stringify(recordActionSafe.mock.calls)).not.toContain('Secret Corp');
    expect(recordActionSafe.mock.calls.at(-1)![0]).toMatchObject({ userId: 'uA', action: 'contract_created', permissionClass: 'A' });
  });
  it('cross-user get, update and delete are null (404)', async () => {
    db.contract.findFirst.mockResolvedValue(null);
    expect(await getContract('uB', 'k1')).toBeNull();
    expect(db.contract.findFirst.mock.calls[0][0].where).toEqual({ id: 'k1', userId: 'uB' });
    expect(await updateContract('uB', 'k1', { title: 'x' })).toBeNull();
    expect(await deleteContract('uB', 'k1')).toBeNull();
    expect(db.contract.updateMany).not.toHaveBeenCalled();
    expect(db.contract.deleteMany).not.toHaveBeenCalled();
  });
  it('update to an inaccessible project or inverted dates writes nothing', async () => {
    db.contract.findFirst.mockResolvedValue(crow({ startDate: new Date('2026-05-01') }));
    db.project.findFirst.mockResolvedValue(null);
    expect(await updateContract('uA', 'k1', { projectId: 'pOther' })).toMatchObject({ value: { kind: 'project_not_found' } });
    expect(await updateContract('uA', 'k1', { endDate: new Date('2026-01-01') })).toMatchObject({ value: { kind: 'bad_dates' } });
    expect(db.contract.updateMany).not.toHaveBeenCalled();
  });
  it('list: filters, user scope, cursor pagination, foreign cursor and foreign project rejected', async () => {
    db.contract.findMany.mockResolvedValue([crow({ id: 'a' }), crow({ id: 'b' }), crow({ id: 'c' })]);
    const r = await listContracts('uA', { subsidiary: 'consult', status: 'ACTIVE', limit: 2 });
    expect(r).toMatchObject({ ok: true, nextCursor: 'b' });
    if (r.ok) expect(r.items).toHaveLength(2);
    expect(db.contract.findMany.mock.calls[0][0].where).toEqual({ userId: 'uA', subsidiary: 'consult', status: 'ACTIVE' });
    db.contract.findFirst.mockResolvedValue(null);
    expect(await listContracts('uA', { cursor: 'foreign', limit: 2 })).toMatchObject({ ok: false, status: 400 });
    db.project.findFirst.mockResolvedValue(null);
    expect(await listContracts('uA', { project: 'pOther', limit: 2 })).toMatchObject({ ok: false, status: 404 });
  });
});

describe('finance', () => {
  it('cents arithmetic is exact and never mixes currencies', () => {
    expect(toCents('0.10') + toCents('0.20')).toBe(30n);
    expect(formatCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
    expect(formatCents(toCents('999999999999.99') + 1n)).toBe('1000000000000.00');
    const g = (subsidiary: string | null, status: string, currency: string, sum: string | null, n: number) => ({ subsidiary, status, currency, _count: { _all: n }, _sum: { valueAmount: sum ? dec(sum) : null } });
    const out = combineContractValue([
      g('consult', 'ACTIVE', 'CAD', '0.10', 1), g('trades', 'ACTIVE', 'CAD', '0.20', 2),
      g('consult', 'DRAFT', 'USD', '5.00', 1), g(null, 'ACTIVE', 'CAD', null, 1),
    ]);
    expect(out.byCurrency).toEqual([{ currency: 'CAD', total: '0.30', contracts: 4 }, { currency: 'USD', total: '5.00', contracts: 1 }]);
    expect(out.byGroup[3]).toMatchObject({ total: '0.00', contractsWithValue: 0, contracts: 1 });
  });
  it('summary reads only stored rows for this user, returns asOf, omits unattributable spend', async () => {
    const now = new Date('2026-10-26T12:00:00Z');
    db.contract.groupBy.mockResolvedValue([{ subsidiary: 'consult', status: 'ACTIVE', currency: 'CAD', _count: { _all: 1 }, _sum: { valueAmount: dec('2500.00') } }]);
    db.contract.findMany.mockResolvedValueOnce([crow({ id: 'e', endDate: new Date('2026-11-01') })]).mockResolvedValueOnce([crow({ id: 'r', renewalDate: new Date('2026-10-30') })]);
    db.userPreference.findUnique.mockResolvedValue({ monthlyTokenBudget: 1000, budgetSoftPct: 80, budgetHardPct: 100 });
    db.usageEvent.aggregate.mockResolvedValue({ _sum: { tokensIn: 100, tokensOut: 50, costMicros: 1234 }, _count: { _all: 3 } });
    const s = await financeSummary('uA', now);
    expect(s.asOf).toBe(now.toISOString());
    expect(s.contracts.byCurrency).toEqual([{ currency: 'CAD', total: '2500.00', contracts: 1 }]);
    expect(s.upcoming.items.map((i) => [i.kind, i.contractId])).toEqual([['renewal', 'r'], ['end', 'e']]);
    expect(s.modelSpend).toMatchObject({ calls: 3, tokensIn: 100, tokensOut: 50, costMicros: 1234, budgetState: 'ok' });
    expect(s.omitted[0].field).toBe('spendBySubsidiary');
    expect(db.contract.groupBy.mock.calls[0][0].where).toEqual({ userId: 'uA' });
    for (const call of db.contract.findMany.mock.calls) expect(call[0].where.userId).toBe('uA');
  });
  it('no route under app/api/finance exports POST, PUT, PATCH or DELETE', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
    const files = walk(join(process.cwd(), 'app/api/finance')).filter((f) => /route\.ts$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(readFileSync(f, 'utf8')).not.toMatch(/export\s+(async\s+)?(function|const)\s+(POST|PUT|PATCH|DELETE)\b|export\s*\{[^}]*\b(POST|PUT|PATCH|DELETE)\b/);
  });
});

describe('meeting provider', () => {
  it('not configured: no URL, no network call', () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(createRoom({})).toEqual({ url: null, reason: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it('https or localhost only, no credentials or query', () => {
    expect(providerBase('https://meet.example.com')).toBeInstanceOf(URL);
    expect(providerBase('http://localhost:8000')).toBeInstanceOf(URL);
    for (const bad of ['http://meet.example.com', 'ftp://x', 'https://u:p@x.com', 'https://x.com/?a=1', 'nonsense']) expect(providerBase(bad)).toBe('invalid');
    expect(createRoom({ MEETING_PROVIDER_BASE_URL: 'http://meet.example.com' })).toEqual({ url: null, reason: 'invalid_config' });
  });
  it('room names are at least 128 bits and unique', () => {
    const names = new Set(Array.from({ length: 200 }, newRoomName));
    expect(names.size).toBe(200);
    for (const n of names) expect(n).toMatch(/^[0-9a-f]{40}$/);
    const r = createRoom({ MEETING_PROVIDER_BASE_URL: 'https://meet.example.com/' });
    expect(r.url).toMatch(/^https:\/\/meet\.example\.com\/[0-9a-f]{40}$/);
  });
});

describe('quick-start route', () => {
  const body = { assistantName: 'Ada', assistantEmail: 'ada.lovelace@whinkgroup.com' };
  const req = () => new Request('http://x/api/meetings/quick-start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const writeLedger = vi.fn().mockResolvedValue({ id: 'l' });
  beforeEach(() => {
    vi.resetModules(); writeLedger.mockClear();
    vi.doMock('@/lib/ledger', () => ({ writeLedger, recordActionSafe: vi.fn(), recordAction: vi.fn() }));
    vi.doMock('@/lib/permission-engine', () => ({ checkPermission: async () => ({ allowed: true, method: 'auto' }) }));
  });
  it('401 without a session', async () => {
    vi.doMock('@/auth', () => ({ auth: async () => null }));
    const { POST } = await import('@/app/api/meetings/quick-start/route');
    expect((await POST(req())).status).toBe(401);
  });
  it('unconfigured: same behaviour as before (meetingUrl null, fallback message), ledgered', async () => {
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'uA' } }) }));
    vi.stubEnv('MEETING_PROVIDER_BASE_URL', '');
    const { POST } = await import('@/app/api/meetings/quick-start/route');
    const j = await (await POST(req())).json();
    expect(j.meetingUrl).toBeNull();
    expect(j.fallback.message).toContain('Meeting room not configured yet');
    expect(writeLedger.mock.calls[0][0]).toMatchObject({ userId: 'uA', action: 'meeting_quick_start' });
  });
  it('configured: returns the room URL and ledgers the host but never the URL', async () => {
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'uA' } }) }));
    vi.stubEnv('MEETING_PROVIDER_BASE_URL', 'https://meet.example.com');
    const { POST } = await import('@/app/api/meetings/quick-start/route');
    const j = await (await POST(req())).json();
    expect(j.meetingUrl).toMatch(/^https:\/\/meet\.example\.com\/[0-9a-f]{40}$/);
    const led = JSON.stringify(writeLedger.mock.calls);
    expect(led).not.toContain(j.meetingUrl);
    expect(led).toContain('meet.example.com');
  });
});

describe('routes: auth, validation, cross-user', () => {
  const ctx = { params: Promise.resolve({ id: 'x' }) };
  const jreq = (method: string, body?: unknown, url = 'http://x/api/y') => new Request(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const routes: Array<[string, string]> = [
    ['change-requests/route', 'GET'], ['change-requests/route', 'POST'], ['change-requests/[id]/route', 'GET'], ['change-requests/[id]/route', 'PATCH'],
    ['change-requests/[id]/refine/route', 'POST'], ['change-requests/[id]/submit/route', 'POST'], ['change-requests/[id]/status/route', 'POST'], ['change-requests/[id]/export/route', 'GET'],
    ['contracts/route', 'GET'], ['contracts/route', 'POST'], ['contracts/[id]/route', 'GET'], ['contracts/[id]/route', 'PATCH'], ['contracts/[id]/route', 'DELETE'],
    ['finance/summary/route', 'GET'],
  ];
  beforeEach(() => { vi.resetModules(); });

  for (const [mod, method] of routes) {
    it(`${method} ${mod} without a session is 401`, async () => {
      vi.doMock('@/auth', () => ({ auth: async () => null }));
      const m = await import(/* @vite-ignore */ `../../app/api/${mod}`);
      expect((await m[method](jreq(method, method === 'GET' ? undefined : {}), ctx)).status).toBe(401);
    });
  }

  const signedIn = () => vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'uA' } }) }));
  it('change request create: 400 on bad input, 201 on good; another user\'s id is 404 everywhere', async () => {
    signedIn();
    vi.doMock('@/lib/permission-engine', () => ({ checkPermission: async () => ({ allowed: true, method: 'auto' }), capabilityClass: () => 'A' }));
    vi.doMock('@/lib/approvals', () => ({ createApproval: vi.fn() }));
    const list = await import('../../app/api/change-requests/route');
    expect((await list.POST(jreq('POST', { title: '', body: 'x' }))).status).toBe(400);
    expect((await list.POST(jreq('POST', { title: 't', body: 'x'.repeat(8001) }))).status).toBe(400);
    db.changeRequest.create.mockResolvedValue({ id: 'cr1', userId: 'uA', title: 't', body: 'b', status: 'DRAFT', spec: null, risk: null, createdAt: new Date(), updatedAt: new Date() });
    expect((await list.POST(jreq('POST', { title: 't', body: 'b' }))).status).toBe(201);
    db.changeRequest.findFirst.mockResolvedValue(null);
    const one = await import('../../app/api/change-requests/[id]/route');
    expect((await one.GET(jreq('GET'), ctx)).status).toBe(404);
    expect((await one.PATCH(jreq('PATCH', { title: 'n' }), ctx)).status).toBe(404);
    for (const p of ['refine', 'submit']) {
      const m = await import(/* @vite-ignore */ `../../app/api/change-requests/[id]/${p}/route`);
      expect((await m.POST(jreq('POST'), ctx)).status).toBe(404);
    }
    const st = await import('../../app/api/change-requests/[id]/status/route');
    expect((await st.POST(jreq('POST', { status: 'MERGED' }), ctx)).status).toBe(404);
    expect((await st.POST(jreq('POST', { status: 'SENT' }), ctx)).status).toBe(400);
    const ex = await import('../../app/api/change-requests/[id]/export/route');
    expect((await ex.GET(jreq('GET'), ctx)).status).toBe(404);
  });
  it('export returns markdown as an attachment for the owner', async () => {
    signedIn();
    db.changeRequest.findFirst.mockResolvedValue({ id: 'cr1', userId: 'uA', title: 'Dark mode', body: 'b', status: 'DRAFT', spec: null, risk: null });
    const ex = await import('../../app/api/change-requests/[id]/export/route');
    const res = await ex.GET(jreq('GET'), { params: Promise.resolve({ id: 'cr1' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(await res.text()).toContain('# Dark mode');
  });
  it('contracts: 400 on bad body, cross-user 404 on id routes, bad query 400', async () => {
    signedIn();
    vi.doMock('@/lib/permission-engine', () => ({ checkPermission: async () => ({ allowed: true, method: 'auto' }), capabilityClass: () => 'A' }));
    const list = await import('../../app/api/contracts/route');
    expect((await list.POST(jreq('POST', { title: 'T' }))).status).toBe(400);
    expect((await list.GET(jreq('GET', undefined, 'http://x/api/contracts?status=BOGUS'))).status).toBe(400);
    db.contract.findFirst.mockResolvedValue(null);
    const one = await import('../../app/api/contracts/[id]/route');
    expect((await one.GET(jreq('GET'), ctx)).status).toBe(404);
    expect((await one.PATCH(jreq('PATCH', { title: 'x' }), ctx)).status).toBe(404);
    expect((await one.DELETE(jreq('DELETE'), ctx)).status).toBe(404);
  });
});
