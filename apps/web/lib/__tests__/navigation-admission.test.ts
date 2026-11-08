import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { profile } = vi.hoisted(() => ({ profile: vi.fn() }));
vi.mock('@/auth', () => ({ auth: (fn: unknown) => fn }));
vi.mock('@/lib/db', () => ({ prisma: { userProfile: { findUnique: profile } } }));

import { NextRequest } from 'next/server';
import proxy from '@/proxy';

function run(path: string, id: string | null = 'account-a') {
  const request = new NextRequest(`http://localhost${path}`);
  Object.assign(request, { auth: id === null ? null : { user: { id } } });
  return (proxy as unknown as (request: NextRequest) => Promise<Response>)(request);
}

beforeEach(() => { profile.mockReset(); vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected HTTP self-call'); })); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('navigation admission', () => {
  it('bounds a stalled readiness read without granting admission', async () => {
    vi.useFakeTimers();
    profile.mockReturnValue(new Promise(() => {}));
    const pending = run('/dashboard');
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('reads only the current account onboarding field without a settings HTTP round trip', async () => {
    profile.mockResolvedValue({ displayName: 'Account A' });
    const response = await run('/dashboard/projects');
    expect(response.status).toBe(200);
    expect(profile).toHaveBeenCalledExactlyOnceWith({ where: { userId: 'account-a' }, select: { displayName: true } });
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get('Content-Security-Policy')).toContain('nonce-');
    expect(response.headers.get('Server-Timing')).toMatch(/^proxy;dur=\d+\.\d$/);
  });

  it('does not reuse readiness across accounts or after profile changes', async () => {
    profile.mockResolvedValueOnce({ displayName: 'Ready' }).mockResolvedValueOnce(null).mockResolvedValueOnce({ displayName: '' });
    expect((await run('/dashboard', 'account-a')).status).toBe(200);
    expect((await run('/dashboard', 'account-b')).headers.get('location')).toContain('/onboarding');
    expect((await run('/dashboard', 'account-a')).headers.get('location')).toContain('/onboarding');
    expect(profile.mock.calls.map(([query]) => query.where.userId)).toEqual(['account-a', 'account-b', 'account-a']);
  });

  it('fails closed with a retryable response if the readiness store is unavailable', async () => {
    profile.mockRejectedValue(new Error('private database detail'));
    const response = await run('/dashboard');
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain('nonce-');
    expect(await response.text()).not.toContain('private database detail');
  });

  it('keeps signed-out admission blocked and leaves API/onboarding/public handling alone', async () => {
    expect((await run('/dashboard', null)).headers.get('location')).toContain('/login');
    for (const path of ['/api/projects', '/onboarding', '/']) expect((await run(path)).status).toBe(200);
    expect(profile).not.toHaveBeenCalled();
  });
});
