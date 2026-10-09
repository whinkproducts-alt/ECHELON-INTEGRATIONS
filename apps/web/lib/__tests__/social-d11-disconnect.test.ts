/**
 * D11 disconnect: the DELETE route deletes the stored tokens and writes a ledger row, scoped to the
 * session user. Real: route, lib/social/connections.disconnect, key-encryption. Mocked: session,
 * db, ledger (captured), platform revoke fetch. No database needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { encryptKey } from '@/lib/key-encryption';

const ACCESS = 'AT-d11-plain-1111';
const REFRESH = 'RT-d11-plain-2222';
const session = { id: null as string | null };
const findFirst = vi.fn();
const deleteMany = vi.fn();
const recordActionSafe = vi.fn();
const deleteScheduled = vi.fn();
const fetchMock = vi.fn();

async function route() {
  vi.doMock('@/auth', () => ({ auth: async () => (session.id ? { user: { id: session.id } } : null) }));
  vi.doMock('@/lib/db', () => ({ prisma: { socialConnection: { findFirst, deleteMany } } }));
  vi.doMock('@/lib/ledger', () => ({ recordActionSafe }));
  vi.doMock('@/lib/social/scheduled-store', () => ({ deleteScheduledRowsForPlatform: deleteScheduled }));
  return import('@/app/api/social/[platform]/connection/route');
}
const del = async (platform: string) => {
  const { DELETE } = await route();
  return DELETE(new NextRequest(`https://app.test/api/social/${platform}/connection`, { method: 'DELETE' }), { params: Promise.resolve({ platform }) });
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.ENCRYPTION_KEY = 'c'.repeat(64);
  session.id = 'userA';
  findFirst.mockResolvedValue({ accessTokenEnc: encryptKey(ACCESS), refreshTokenEnc: encryptKey(REFRESH), platform: 'x' });
  deleteMany.mockResolvedValue({ count: 1 });
  deleteScheduled.mockResolvedValue(0);
  recordActionSafe.mockResolvedValue({ id: 'a1' });
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('D11 disconnect', () => {
  it.each(['x', 'instagram', 'tiktok'])('%s: deletes the connection row (tokens) scoped to the session user and writes a social_disconnected ledger row', async (p) => {
    const res = await del(p);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'userA', platform: p } });
    expect(deleteScheduled).toHaveBeenCalledWith('userA', p);
    expect(recordActionSafe).toHaveBeenCalledTimes(1);
    expect(recordActionSafe.mock.calls[0][0]).toMatchObject({ userId: 'userA', action: 'social_disconnected', tool: `social:${p}`, initiator: 'user' });
  });

  it('the ledger row, response and logs carry no token', async () => {
    const logs: string[] = [];
    for (const m of ['log', 'info', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const res = await del('x');
    const everything = JSON.stringify(recordActionSafe.mock.calls) + (await res.text()) + logs.join('\n');
    expect(everything).not.toContain(ACCESS);
    expect(everything).not.toContain(REFRESH);
  });

  it('the row is deleted and the ledger is written even when the platform revoke call fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const res = await del('x');
    expect(res.status).toBe(200);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(recordActionSafe).toHaveBeenCalledTimes(1);
  });

  it('disconnecting when nothing is connected still writes a ledger row and does not throw', async () => {
    findFirst.mockResolvedValue(null);
    deleteMany.mockResolvedValue({ count: 0 });
    const res = await del('x');
    expect(res.status).toBe(200);
    expect(recordActionSafe).toHaveBeenCalledTimes(1);
    expect(recordActionSafe.mock.calls[0][0].outputSummary).toMatch(/0 connection/);
  });

  it('unauthenticated: 401, nothing deleted, nothing ledgered, no lookup', async () => {
    session.id = null;
    const res = await del('x');
    expect(res.status).toBe(401);
    expect(findFirst).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(recordActionSafe).not.toHaveBeenCalled();
  });

  it('unknown platform: 400, nothing deleted or ledgered', async () => {
    const res = await del('facebook');
    expect(res.status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(recordActionSafe).not.toHaveBeenCalled();
  });

  it('a user id supplied in the URL or body cannot redirect the delete: only the session user is ever used', async () => {
    const { DELETE } = await route();
    await DELETE(new NextRequest('https://app.test/api/social/x/connection?userId=victim', { method: 'DELETE', body: JSON.stringify({ userId: 'victim' }) }), { params: Promise.resolve({ platform: 'x' }) });
    for (const c of [...findFirst.mock.calls, ...deleteMany.mock.calls]) expect(JSON.stringify(c)).not.toContain('victim');
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'userA', platform: 'x' } });
  });
});
