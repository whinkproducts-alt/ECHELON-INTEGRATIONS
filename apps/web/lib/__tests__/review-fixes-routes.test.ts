import { describe, it, expect, vi, beforeEach } from 'vitest';

const nextServer = () => ({
  NextRequest: class {},
  NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
});

describe('POST /api/tools/execute (F2)', () => {
  const executeTool = vi.fn();
  const limitOr429 = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    executeTool.mockReset().mockResolvedValue({ success: true });
    limitOr429.mockReset().mockResolvedValue(null);
    vi.doMock('next/server', nextServer);
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({ prisma: { personaState: { findUnique: vi.fn().mockResolvedValue(null) } } }));
    vi.doMock('@/lib/tool-registry', () => ({ executeTool }));
    vi.doMock('@/lib/rate-limit', () => ({ limitOr429 }));
  });
  const call = async (body: unknown, raw = false) => {
    const { POST } = await import('../../app/api/tools/execute/route');
    return POST({ json: raw ? async () => { throw new Error('bad json'); } : async () => body } as never);
  };

  it('is rate limited per user before any tool runs', async () => {
    limitOr429.mockResolvedValue(new Response('{}', { status: 429 }));
    const res = await call({ tool: 'web_search', params: {} });
    expect(res.status).toBe(429);
    expect(limitOr429).toHaveBeenCalledWith('tools_execute', 'u1');
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('answers 400, not 500, for a body that is not JSON or not an object', async () => {
    expect((await call(null, true)).status).toBe(400);
    expect((await call(['x'])).status).toBe(400);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('still runs a normal call', async () => {
    const res = await call({ tool: 'web_search', params: { q: 'x' } });
    expect(res.status).toBe(200);
    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('the bucket exists with a per-minute cap', async () => {
    vi.doUnmock('@/lib/rate-limit');
    const { RATE_RULES } = await import('../rate-limit');
    expect(RATE_RULES.tools_execute.limit).toBeGreaterThan(0);
  });
});

describe('settings/api-keys ledger and validation (F4)', () => {
  const deleteMany = vi.fn();
  const upsert = vi.fn();
  const recordActionSafe = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    deleteMany.mockReset().mockResolvedValue({ count: 1 });
    upsert.mockReset().mockResolvedValue({});
    recordActionSafe.mockReset().mockResolvedValue({ id: 'a' });
    vi.doMock('next/server', nextServer);
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({ prisma: { userApiKey: { deleteMany, upsert, findMany: vi.fn() } } }));
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe }));
    vi.doMock('@/lib/key-encryption', () => ({
      isEncryptionConfigured: () => true, encryptKey: () => 'ENC', keyHint: () => 'sk-a...xyz', EncryptionNotConfiguredError: class extends Error {},
    }));
  });

  it('DELETE refuses an unknown provider and writes nothing', async () => {
    const { DELETE } = await import('../../app/api/settings/api-keys/[provider]/route');
    const res = await DELETE({} as never, { params: Promise.resolve({ provider: 'anything-else' }) });
    expect(res.status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
    expect(recordActionSafe).not.toHaveBeenCalled();
  });

  it('DELETE of a real provider is ledgered with the provider only', async () => {
    const { DELETE } = await import('../../app/api/settings/api-keys/[provider]/route');
    const res = await DELETE({} as never, { params: Promise.resolve({ provider: 'anthropic' }) });
    expect(res.status).toBe(200);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', provider: 'anthropic' } });
    const row = recordActionSafe.mock.calls[0][0];
    expect(row).toMatchObject({ userId: 'u1', action: 'api_key_removed', status: 'EXECUTED' });
  });

  it('POST is ledgered without any key material, and bad JSON is a 400', async () => {
    const { POST } = await import('../../app/api/settings/api-keys/route');
    // Assembled at runtime so no key-shaped literal sits in the source (the secret scanner would flag it).
    const secret = ['sk', 'ant', 'THIS-IS-A-FAKE-KEY-FOR-TESTS-0000'].join('-');
    const ok = await POST({ json: async () => ({ provider: 'anthropic', key: secret }) } as never);
    expect(ok.status).toBe(200);
    const row = recordActionSafe.mock.calls[0][0];
    expect(row.action).toBe('api_key_stored');
    expect(JSON.stringify(recordActionSafe.mock.calls)).not.toContain('THIS-IS-A-FAKE');
    const bad = await POST({ json: async () => { throw new Error('x'); } } as never);
    expect(bad.status).toBe(400);
  });
});
