import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SIGNUP_ENABLED', () => {
  const create = vi.fn();
  const security = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    security.mockReset();
    vi.doMock('@/lib/db', () => ({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(null), create: create.mockResolvedValue({ id: 'u1' }) },
        userProfile: { create: vi.fn() },
        userPreference: { create: vi.fn() },
        personaState: { create: vi.fn() },
      },
    }));
    vi.doMock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('h') } }));
    vi.doMock('@/lib/logger', () => ({ logger: { security, info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
  });
  afterEach(() => vi.unstubAllEnvs());

  const call = async () => {
    const { POST } = await import('@/app/api/signup/route');
    return POST(new Request('http://localhost/api/signup', { method: 'POST', body: JSON.stringify({ email: 'a@b.co', password: 'pw' }) }) as never);
  };

  it('returns 403, writes nothing and logs a security event when false', async () => {
    vi.stubEnv('SIGNUP_ENABLED', 'false');
    const res = await call();
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
    expect(security).toHaveBeenCalledTimes(1);
  });
  it.each(['', 'true'])('stays open when %j', async (v) => {
    vi.stubEnv('SIGNUP_ENABLED', v);
    expect((await call()).status).toBe(200);
  });
});
