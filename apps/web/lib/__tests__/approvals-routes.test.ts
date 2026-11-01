import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('approvals routes', () => {
  const auth = vi.fn();
  const decide = vi.fn();
  const listPending = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    auth.mockReset().mockResolvedValue({ user: { id: 'u1' } });
    decide.mockReset();
    listPending.mockReset();
    vi.doMock('next/server', () => ({
      NextRequest: class {},
      NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
    }));
    vi.doMock('@/auth', () => ({ auth }));
    vi.doMock('@/lib/approvals', () => ({ decide, listPending }));
  });

  const post = async (body: unknown, id = 'ap1', raw = false, contentType: string | null = 'application/json') => {
    const { POST } = await import('../../app/api/approvals/[id]/decision/route');
    const req = {
      headers: new Headers(contentType ? { 'content-type': contentType } : {}),
      json: async () => { if (raw) throw new Error('bad json'); return body; },
    } as never;
    return POST(req, { params: Promise.resolve({ id }) });
  };

  it('GET lists pending for the session user; 401 without session', async () => {
    const { GET } = await import('../../app/api/approvals/route');
    listPending.mockResolvedValue([{ id: 'ap1' }]);
    const res = await GET({ url: 'http://x/api/approvals?status=pending' } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approvals: [{ id: 'ap1' }] });
    expect(listPending).toHaveBeenCalledWith('u1');

    auth.mockResolvedValue(null);
    expect((await GET({ url: 'http://x/api/approvals?status=pending' } as never)).status).toBe(401);
  });

  it('GET rejects unknown status filters', async () => {
    const { GET } = await import('../../app/api/approvals/route');
    expect((await GET({ url: 'http://x/api/approvals?status=all' } as never)).status).toBe(400);
  });

  it('POST 401 without session and never decides', async () => {
    auth.mockResolvedValue(null);
    expect((await post({ decision: 'approve' })).status).toBe(401);
    expect(decide).not.toHaveBeenCalled();
  });

  it('POST 200 returns {id,status,result}', async () => {
    decide.mockResolvedValue({ id: 'ap1', status: 'EXECUTED', result: { success: true } });
    const res = await post({ decision: 'approve' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'ap1', status: 'EXECUTED', result: { success: true } });
    expect(decide).toHaveBeenCalledWith('u1', 'ap1', 'approve');
  });

  it('POST 415 unless Content-Type is application/json (text/plain, form, none)', async () => {
    decide.mockResolvedValue({ id: 'ap1', status: 'DENIED', result: null });
    for (const ct of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', null]) {
      expect((await post({ decision: 'approve' }, 'ap1', false, ct)).status).toBe(415);
    }
    expect((await post({ decision: 'deny' }, 'ap1', false, 'application/json; charset=utf-8')).status).not.toBe(415);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledWith('u1', 'ap1', 'deny');
  });

  it('POST 404 on NOT_FOUND', async () => {
    decide.mockResolvedValue({ id: 'ap9', status: 'NOT_FOUND', result: null });
    expect((await post({ decision: 'deny' }, 'ap9')).status).toBe(404);
  });

  it('POST 400 on invalid bodies, including smuggled tool/params', async () => {
    for (const body of [null, [], 'approve', {}, { decision: 'yes' }, { decision: 'approve', params: { x: 1 } }, { decision: 'approve', tool: 'x' }]) {
      expect((await post(body)).status).toBe(400);
    }
    expect((await post(null, 'ap1', true)).status).toBe(400);
    expect(decide).not.toHaveBeenCalled();
  });
});
