import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('SIGNUP_ENABLED', () => {
  const create = vi.fn();
  const findUnique = vi.fn();
  const count = vi.fn();
  const security = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    create.mockReset();
    findUnique.mockReset();
    count.mockReset();
    security.mockReset();
    const prisma: any = {
      user: { findUnique: findUnique.mockResolvedValue(null), count: count.mockResolvedValue(0), create: create.mockResolvedValue({ id: 'u1' }) },
      userProfile: { create: vi.fn() },
      userPreference: { create: vi.fn() },
      personaState: { create: vi.fn() },
      $executeRaw: vi.fn(),
    };
    prisma.$transaction = async (fn: any) => fn(prisma);
    vi.doMock('@/lib/db', () => ({ prisma }));
    vi.doMock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('h') } }));
    vi.doMock('@/lib/logger', () => ({ logger: { security, info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
  });
  afterEach(() => vi.unstubAllEnvs());

  const call = async (email = 'a@b.co') => {
    const { POST } = await import('@/app/api/signup/route');
    return POST(new Request('http://localhost/api/signup', { method: 'POST', body: JSON.stringify({ email, password: 'pw' }) }) as never);
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

  it('closed by default once a user exists (unset, empty, other text)', async () => {
    for (const v of ['', 'yes', '1']) {
      vi.stubEnv('SIGNUP_ENABLED', v);
      count.mockResolvedValue(1);
      create.mockClear();
      expect((await call()).status).toBe(403);
      expect(create).not.toHaveBeenCalled();
    }
  });
  it('first-user bootstrap: an empty users table allows signup when unset', async () => {
    vi.stubEnv('SIGNUP_ENABLED', '');
    count.mockResolvedValue(0);
    expect((await call()).status).toBe(200);
  });
  it('SIGNUP_ENABLED=false stays closed even when the table is empty', async () => {
    vi.stubEnv('SIGNUP_ENABLED', 'false');
    count.mockResolvedValue(0);
    expect((await call()).status).toBe(403);
  });
  it('exactly true opens signup with users present', async () => {
    vi.stubEnv('SIGNUP_ENABLED', 'true');
    count.mockResolvedValue(5);
    expect((await call()).status).toBe(200);
  });
  it('stores the email trimmed and lowercased', async () => {
    vi.stubEnv('SIGNUP_ENABLED', 'true');
    await call('  WhinkProducts@Gmail.COM ');
    expect(create.mock.calls[0][0].data.email).toBe('whinkproducts@gmail.com');
    expect(findUnique.mock.calls[0][0].where.email).toBe('whinkproducts@gmail.com');
  });
  it('a case-variant of an existing email is a duplicate (409), so it cannot shadow an owner', async () => {
    vi.stubEnv('SIGNUP_ENABLED', 'true');
    findUnique.mockResolvedValue({ id: 'owner' });
    expect((await call('WhinkProducts@Gmail.com')).status).toBe(409);
    expect(create).not.toHaveBeenCalled();
    const { isOwnerEmail } = await import('@/lib/owner');
    expect(isOwnerEmail('WhinkProducts@Gmail.com', { WHINK_OWNER_EMAILS: 'whinkproducts@gmail.com' })).toBe(true);
  });
});
