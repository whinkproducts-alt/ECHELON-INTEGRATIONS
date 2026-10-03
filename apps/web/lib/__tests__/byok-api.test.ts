/**
 * Tests for BYOK API routes:
 *   GET  /api/settings/api-keys    — list stored key hints
 *   POST /api/settings/api-keys    — upsert a provider key
 *   DELETE /api/settings/api-keys/[provider] — remove a key
 *
 * All Prisma calls and auth are mocked — no real database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── shared mocks ──────────────────────────────────────────────────────────────

const TEST_USER_ID = 'user-test-123';
const ENCRYPTION_KEY = 'b'.repeat(64);

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: TEST_USER_ID } }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    userApiKey: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRequest(method: string, body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    (init as any).headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest('http://localhost/api/settings/api-keys', init);
}

// ── GET ───────────────────────────────────────────────────────────────────────

describe('GET /api/settings/api-keys', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
    vi.clearAllMocks();
  });

  it('returns stored key hints without plaintext keys', async () => {
    const { prisma } = await import('@/lib/db');
    (prisma.userApiKey.findMany as any).mockResolvedValue([
      { provider: 'anthropic', keyHint: 'ab12', createdAt: new Date().toISOString() },
      { provider: 'openai', keyHint: 'cd34', createdAt: new Date().toISOString() },
    ]);

    const { GET } = await import('../../app/api/settings/api-keys/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].provider).toBe('anthropic');
    expect(body[0].keyHint).toBe('ab12');
    // encryptedKey must NOT be present
    expect(body[0].encryptedKey).toBeUndefined();
  });

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValueOnce(null);

    const { GET } = await import('../../app/api/settings/api-keys/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

// ── POST ──────────────────────────────────────────────────────────────────────

describe('POST /api/settings/api-keys', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
    vi.clearAllMocks();
  });

  it('saves a valid Anthropic key and returns hint', async () => {
    const { prisma } = await import('@/lib/db');
    (prisma.userApiKey.upsert as any).mockResolvedValue({});

    const { POST } = await import('../../app/api/settings/api-keys/route');
    const req = makeRequest('POST', {
      provider: 'anthropic',
      key: 'sk-ant-api03-supersecretkey1234567890ab',
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.provider).toBe('anthropic');
    expect(body.keyHint).toHaveLength(4); // last 4 chars
    expect(prisma.userApiKey.upsert).toHaveBeenCalledOnce();
    // The stored encrypted key must not equal the plaintext
    const upsertArg = (prisma.userApiKey.upsert as any).mock.calls[0][0];
    expect(upsertArg.create.encryptedKey).not.toBe('sk-ant-api03-supersecretkey1234567890ab');
  });

  it('saves a valid OpenAI key and returns hint', async () => {
    const { prisma } = await import('@/lib/db');
    (prisma.userApiKey.upsert as any).mockResolvedValue({});

    const { POST } = await import('../../app/api/settings/api-keys/route');
    const req = makeRequest('POST', {
      provider: 'openai',
      key: 'sk-openaifakekey1234567890abcdef',
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json()).provider).toBe('openai');
  });

  it('rejects unknown provider', async () => {
    const { POST } = await import('../../app/api/settings/api-keys/route');
    const req = makeRequest('POST', { provider: 'grok', key: 'sk-ant-api03-abcdef1234567890' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid provider/i);
  });

  it('rejects key shorter than 20 characters', async () => {
    const { POST } = await import('../../app/api/settings/api-keys/route');
    const req = makeRequest('POST', { provider: 'anthropic', key: 'sk-ant-short' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too short/i);
  });

  it('rejects Anthropic key without sk-ant- prefix', async () => {
    const { POST } = await import('../../app/api/settings/api-keys/route');
    const req = makeRequest('POST', { provider: 'anthropic', key: 'sk-wrongprefix-1234567890abcdef' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/sk-ant-/i);
  });

  it('rejects OpenAI key without sk- prefix', async () => {
    const { POST } = await import('../../app/api/settings/api-keys/route');
    const req = makeRequest('POST', { provider: 'openai', key: 'api-wrongprefix-1234567890abcdef' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValueOnce(null);

    const { POST } = await import('../../app/api/settings/api-keys/route');
    const req = makeRequest('POST', { provider: 'anthropic', key: 'sk-ant-api03-test1234567890' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

describe('DELETE /api/settings/api-keys/[provider]', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
    vi.clearAllMocks();
  });

  it('deletes the stored key for the given provider', async () => {
    const { prisma } = await import('@/lib/db');
    (prisma.userApiKey.deleteMany as any).mockResolvedValue({ count: 1 });

    const { DELETE } = await import('../../app/api/settings/api-keys/[provider]/route');
    const req = new NextRequest('http://localhost/api/settings/api-keys/anthropic', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ provider: 'anthropic' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
    expect(prisma.userApiKey.deleteMany).toHaveBeenCalledWith({
      where: { userId: TEST_USER_ID, provider: 'anthropic' },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const { auth } = await import('@/auth');
    (auth as any).mockResolvedValueOnce(null);

    const { DELETE } = await import('../../app/api/settings/api-keys/[provider]/route');
    const req = new NextRequest('http://localhost/api/settings/api-keys/openai', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ provider: 'openai' }) });
    expect(res.status).toBe(401);
  });
});
