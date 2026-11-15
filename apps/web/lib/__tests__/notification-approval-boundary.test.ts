import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { recommendation: { findFirst: mocks.findFirst, create: mocks.create } } }));
vi.mock('@/lib/comms/delivery', () => ({ deliver: mocks.send }));
import { notify } from '@/lib/notifications/deliver';
describe('notification approval boundary', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findFirst.mockResolvedValue(null); mocks.create.mockResolvedValue({ id: 'notice' }); });
  it('stores the report in-app without sending protected email', async () => {
    expect(await notify({ userId: 'owner', dedupeKey: 'monthly', title: 'Report', body: 'Private spend', emailSubject: 'Report' })).toEqual({ inApp: 'created', email: 'skipped' });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'owner', dedupeKey: 'monthly' }) }));
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not create another report on a repeated delivery', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'existing' });
    expect(await notify({ userId: 'owner', dedupeKey: 'monthly', title: 'Report', body: 'Private spend' })).toEqual({ inApp: 'duplicate', email: 'skipped' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
