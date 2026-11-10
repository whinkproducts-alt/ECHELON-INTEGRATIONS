import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), upsert: vi.fn() }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ prisma: { tenantConfig: { findUnique: mocks.find, upsert: mocks.upsert } } }));
import { GET } from '@/app/api/tenant/config/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'a' } });
});

describe('tenant configuration display read', () => {
  it('does not write merely to read an existing configuration', async () => {
    mocks.find.mockResolvedValue({ tenantId: 'a', productName: 'Account A' });
    expect(await (await GET()).json()).toEqual({ tenantId: 'a', productName: 'Account A' });
    expect(mocks.find).toHaveBeenCalledExactlyOnceWith({ where: { tenantId: 'a' } });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('retains schema defaults on first use and scopes both paths to the authenticated account', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'b' } });
    mocks.find.mockResolvedValue(null); mocks.upsert.mockResolvedValue({ tenantId: 'b', productName: 'Default' });
    await GET();
    expect(mocks.find).toHaveBeenCalledWith({ where: { tenantId: 'b' } });
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith({ where: { tenantId: 'b' }, create: { tenantId: 'b' }, update: {} });
  });
  it('does no configuration read or write without an authenticated account', async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.find).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
