import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const KEY = 'b'.repeat(64);

function mockDb() {
  const prisma: any = {
    user: {
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.co' }),
    },
    userProfile: { create: vi.fn().mockResolvedValue({}) },
    userPreference: { create: vi.fn().mockResolvedValue({}) },
    personaState: { create: vi.fn().mockResolvedValue({}) },
    $executeRaw: vi.fn().mockResolvedValue(0),
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  return prisma;
}

async function postSignup(prisma: any, body: Record<string, unknown>) {
  vi.doMock('@/lib/db', () => ({ prisma }));
  vi.doMock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('h') } }));
  const { POST } = await import('@/app/api/signup/route');
  const req = new Request('http://localhost/api/signup', { method: 'POST', body: JSON.stringify(body) });
  return POST(req as never);
}

describe('signup urgent contact', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ENCRYPTION_KEY', KEY);
    vi.stubEnv('SIGNUP_ENABLED', 'true');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@/lib/db');
    vi.doUnmock('bcryptjs');
  });

  it('stores the number encrypted with the chosen channels', async () => {
    const prisma = mockDb();
    const res = await postSignup(prisma, {
      email: 'founder@example.com',
      password: 'password123',
      name: 'Founder',
      urgentPhone: '+1 (555) 123-4567',
      urgentChannels: ['sms', 'whatsapp'],
    });

    expect(res.status).toBe(200);
    const profile = prisma.userProfile.create.mock.calls[0][0].data;
    expect(profile.userId).toBe('u1');
    expect(profile.urgentChannels).toEqual(['sms', 'whatsapp']);
    expect(profile.urgentPhoneE164Enc).toMatch(/^[0-9a-f]+$/);
    expect(JSON.stringify(profile)).not.toContain('5551234567');
  });

  it('rejects an unusable number before creating the account', async () => {
    const prisma = mockDb();
    const res = await postSignup(prisma, {
      email: 'founder@example.com',
      password: 'password123',
      urgentPhone: '555 123 4567',
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/international format/i);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses the number rather than store it in the clear when encryption is off', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    const prisma = mockDb();
    const res = await postSignup(prisma, {
      email: 'founder@example.com',
      password: 'password123',
      urgentPhone: '+15551234567',
    });

    expect(res.status).toBe(503);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('leaves the profile untouched when no number is given', async () => {
    const prisma = mockDb();
    const res = await postSignup(prisma, { email: 'founder@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(prisma.userProfile.create.mock.calls[0][0].data).toEqual({ userId: 'u1' });
  });
});
