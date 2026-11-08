import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock prisma ──────────────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  prisma: {
    tenantConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

// ── Mock auth ────────────────────────────────────────────────────
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { auth } from '@/auth';
import { GET, PATCH } from '@/app/api/tenant/config/route';

const mockUpsert = prisma.tenantConfig.upsert as ReturnType<typeof vi.fn>;
const mockFind = prisma.tenantConfig.findUnique as ReturnType<typeof vi.fn>;
const mockAuth = auth as ReturnType<typeof vi.fn>;

const DEFAULT_CONFIG = {
  id: 'cfg1',
  tenantId: 'user1',
  productName: 'WHINK',
  logoUrl: null,
  accentColor: '#38B6FF',
  supportUrl: null,
  privacyUrl: null,
  termsUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/tenant/config', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with default config when none exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1' } });
    mockFind.mockResolvedValue(null);
    mockUpsert.mockResolvedValue(DEFAULT_CONFIG);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.productName).toBe('WHINK');
    expect(body.accentColor).toBe('#38B6FF');
    expect(mockFind).toHaveBeenCalledExactlyOnceWith({ where: { tenantId: 'user1' } });
    expect(mockUpsert).toHaveBeenCalledExactlyOnceWith({ where: { tenantId: 'user1' }, create: { tenantId: 'user1' }, update: {} });
  });
});

describe('PATCH /api/tenant/config', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const req = new Request('http://localhost/api/tenant/config', {
      method: 'PATCH',
      body: JSON.stringify({ productName: 'MyApp' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 when user is not admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1', role: 'user' } });
    const req = new Request('http://localhost/api/tenant/config', {
      method: 'PATCH',
      body: JSON.stringify({ productName: 'MyApp' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it('updates config when user is admin', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user1', role: 'admin' } });
    const updated = { ...DEFAULT_CONFIG, productName: 'MyApp' };
    mockUpsert.mockResolvedValue(updated);

    const req = new Request('http://localhost/api/tenant/config', {
      method: 'PATCH',
      body: JSON.stringify({ productName: 'MyApp' }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.productName).toBe('MyApp');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ productName: 'MyApp' }),
      })
    );
  });
});
