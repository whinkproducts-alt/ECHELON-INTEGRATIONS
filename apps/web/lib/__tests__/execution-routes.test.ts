import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const stubs = vi.hoisted(() => ({ auth: vi.fn(), find: vi.fn(), cancel: vi.fn() }));
vi.mock('@/auth', () => ({ auth: stubs.auth }));
vi.mock('@/lib/db', () => ({ prisma: { agentExecution: { findFirst: stubs.find } } }));
vi.mock('@/lib/worker/ear-execution', () => ({ cancelExecution: stubs.cancel }));
vi.mock('@/lib/rate-limit', () => ({ limitOr429: vi.fn().mockResolvedValue(null) }));
import { GET, POST } from '@/app/api/executions/[id]/route';
const ctx = { params: Promise.resolve({ id: 'exec-id' }) };
const req = (body = { action: 'cancel' }) => new NextRequest('http://localhost/api/executions/exec-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); stubs.auth.mockResolvedValue({ user: { id: 'owner-a' } }); });
describe('execution receipts and cancellation access', () => {
  it('requires authentication for reads and cancellation', async () => {
    stubs.auth.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(401);
    expect((await POST(req(), ctx)).status).toBe(401);
    expect(stubs.find).not.toHaveBeenCalled(); expect(stubs.cancel).not.toHaveBeenCalled();
  });
  it('scopes reads to the authenticated user and hides foreign IDs', async () => {
    stubs.find.mockResolvedValue(null);
    expect((await GET(req(), ctx)).status).toBe(404);
    expect(stubs.find).toHaveBeenCalledWith({ where: { id: 'exec-id', userId: 'owner-a' } });
    stubs.find.mockResolvedValue({ id: 'exec-id', status: 'QUEUED' });
    expect((await (await GET(req(), ctx)).json()).execution.status).toBe('QUEUED');
  });
  it('cancels only for the session owner; accepts no new execution parameters', async () => {
    stubs.cancel.mockResolvedValue(true);
    expect((await (await POST(req(), ctx)).json()).cancelled).toBe(true);
    expect(stubs.cancel).toHaveBeenCalledWith('owner-a', 'exec-id');
    const extra = new NextRequest('http://localhost/api/executions/exec-id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel', userId: 'other' }) });
    expect((await POST(extra, ctx)).status).toBe(400);
    const form = new NextRequest('http://localhost/api/executions/exec-id', { method: 'POST', body: 'action=cancel' });
    expect((await POST(form, ctx)).status).toBe(415);
  });
});
