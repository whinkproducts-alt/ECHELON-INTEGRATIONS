import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('signup never grants gateway access', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('OPENCLAW_ALLOWED_USER_IDS', 'owner1');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a freshly signed-up user, even one stored with role owner, cannot use the gateway', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'new-user', role: 'owner' });
    vi.doMock('@/lib/db', () => ({
      prisma: {
        user: { findUnique: vi.fn().mockResolvedValue(null), create },
        userProfile: { create: vi.fn() },
        userPreference: { create: vi.fn() },
        personaState: { create: vi.fn() },
      },
    }));
    vi.doMock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('h') } }));
    const { POST } = await import('@/app/api/signup/route');
    const req = new Request('http://localhost/api/signup', { method: 'POST', body: JSON.stringify({ email: 'a@b.co', password: 'pw', role: 'owner' }) });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(create.mock.calls[0][0].data.role).toBe('user');
    const { canUseGateway } = await import('@/lib/gateway-access');
    expect(await canUseGateway('new-user')).toBe(false);
  });
});
