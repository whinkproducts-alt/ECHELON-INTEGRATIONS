import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, resetDb } from './helpers/mock-db';

const auth = vi.fn();
vi.mock('next/server', () => ({ NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) } }));
vi.mock('@/auth', () => ({ auth }));
vi.mock('@/lib/db', () => ({ prisma: db }));
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'l' });
vi.mock('@/lib/ledger', () => ({ recordActionSafe: (e: unknown) => recordActionSafe(e), recordAction: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ limitOr429: async () => null }));

beforeEach(() => {
  resetDb(); auth.mockReset().mockResolvedValue({ user: { id: 'uA' } }); recordActionSafe.mockClear();
});

describe('GET /api/recommendations', () => {
  it('401 without a session', async () => {
    auth.mockResolvedValue(null);
    const { GET } = await import('../../app/api/recommendations/route');
    expect((await GET(new Request('http://x/api/recommendations'))).status).toBe(401);
  });
  it('lists own undismissed rows newest first with a limit', async () => {
    db.recommendation.findMany.mockResolvedValue([{ id: 'r1', title: 't' }]);
    const { GET } = await import('../../app/api/recommendations/route');
    const res = await GET(new Request('http://x/api/recommendations?limit=5'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: 'r1', title: 't' }] });
    const arg = db.recommendation.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'uA', dismissedAt: null });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.take).toBe(5);
    expect(arg.select.dedupeKey).toBeUndefined();
    expect(arg.select.userId).toBeUndefined();
  });
  it('400 on a bad limit or unknown query field', async () => {
    const { GET } = await import('../../app/api/recommendations/route');
    expect((await GET(new Request('http://x/api/recommendations?limit=0'))).status).toBe(400);
    expect((await GET(new Request('http://x/api/recommendations?limit=1000'))).status).toBe(400);
    expect((await GET(new Request('http://x/api/recommendations?userId=uB'))).status).toBe(400);
  });
});

describe('POST /api/recommendations/[id]/dismiss', () => {
  const call = async (id: string) => {
    const { POST } = await import('../../app/api/recommendations/[id]/dismiss/route');
    return POST(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ id }) });
  };
  it('401 without a session', async () => {
    auth.mockResolvedValue(null);
    expect((await call('abcdefgh12')).status).toBe(401);
  });
  it('dismisses own row via permission check and ledger', async () => {
    db.recommendation.updateMany.mockResolvedValue({ count: 1 });
    const res = await call('abcdefgh12');
    expect(res.status).toBe(200);
    expect(db.recommendation.updateMany.mock.calls[0][0].where).toEqual({ id: 'abcdefgh12', userId: 'uA', dismissedAt: null });
    expect(db.userProfile.findUnique).toHaveBeenCalled();
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ userId: 'uA', action: 'recommendation_dismissed', status: 'VALIDATED' }));
  });
  it("another user's id (or unknown id) is 404 and nothing changes", async () => {
    db.recommendation.updateMany.mockResolvedValue({ count: 0 });
    const res = await call('someoneelse1');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
  it('a malformed id is 404 without touching the database', async () => {
    expect((await call('x y; DROP')).status).toBe(404);
    expect(db.recommendation.updateMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/worker/status', () => {
  it('401 without a session', async () => {
    auth.mockResolvedValue(null);
    const { GET } = await import('../../app/api/worker/status/route');
    expect((await GET()).status).toBe(401);
  });
  it('returns own-scope facts only, no errors or ids', async () => {
    db.agentHeartbeat.findFirst.mockResolvedValue({ lastSeenAt: new Date(Date.now() - 12_000) });
    db.agentJob.findMany.mockResolvedValue([{ jobKey: 'news_digest:news-canada', lastRunAt: null, lastStatus: 'FAILED', nextRunAt: new Date(), runs: 3 }]);
    const { GET } = await import('../../app/api/worker/status/route');
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rosterSize).toBe(28);
    expect(body.enabledCount).toBe(21);
    expect(body.heartbeatAgeSeconds).toBeGreaterThanOrEqual(11);
    expect(body.jobs[0]).toEqual(expect.objectContaining({ jobKey: 'news_digest:news-canada', lastStatus: 'FAILED', runs: 3 }));
    expect(JSON.stringify(body)).not.toMatch(/lastError|leaseOwner|workerId/);
    expect(db.agentJob.findMany.mock.calls[0][0].where).toEqual({ userId: 'uA' });
  });
  it('no heartbeat yet gives null age', async () => {
    db.agentHeartbeat.findFirst.mockResolvedValue(null); db.agentJob.findMany.mockResolvedValue([]);
    const { GET } = await import('../../app/api/worker/status/route');
    expect((await (await GET()).json()).heartbeatAgeSeconds).toBeNull();
  });
});
