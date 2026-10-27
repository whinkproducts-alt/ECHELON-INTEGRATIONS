import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('POST /api/briefing/sms', () => {
  const auth = vi.fn();
  const requestSmsBriefing = vi.fn();
  const limitOr429 = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset().mockResolvedValue({ user: { id: 'u1' } });
    requestSmsBriefing.mockReset();
    limitOr429.mockReset().mockResolvedValue(null);
    vi.doMock('next/server', () => ({
      NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
    }));
    vi.doMock('@/auth', () => ({ auth }));
    vi.doMock('@/lib/owner', () => ({ isOwnerEmail: () => false }));
    vi.doMock('@/lib/rate-limit', () => ({ limitOr429 }));
    vi.doMock('@/lib/briefing/sms', () => ({ requestSmsBriefing }));
  });

  it('401 without a session, nothing built', async () => {
    auth.mockResolvedValue(null);
    const { POST } = await import('../../app/api/briefing/sms/route');
    expect((await POST()).status).toBe(401);
    expect(requestSmsBriefing).not.toHaveBeenCalled();
  });

  it('429 when rate limited', async () => {
    limitOr429.mockResolvedValue(new Response('{}', { status: 429 }));
    const { POST } = await import('../../app/api/briefing/sms/route');
    expect((await POST()).status).toBe(429);
    expect(requestSmsBriefing).not.toHaveBeenCalled();
  });

  it('400 no_sms_number', async () => {
    requestSmsBriefing.mockResolvedValue({ ok: false, status: 400, error: 'no_sms_number' });
    const { POST } = await import('../../app/api/briefing/sms/route');
    const res = await POST();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no_sms_number' });
  });

  it('returns approvalId, approval and preview scoped to the session user', async () => {
    requestSmsBriefing.mockResolvedValue({ ok: true, approvalId: 'ap1', approval: { id: 'ap1' }, preview: 'text' });
    const { POST } = await import('../../app/api/briefing/sms/route');
    const res = await POST();
    expect(await res.json()).toEqual({ approvalId: 'ap1', approval: { id: 'ap1' }, preview: 'text' });
    expect(requestSmsBriefing).toHaveBeenCalledWith('u1');
  });
});
