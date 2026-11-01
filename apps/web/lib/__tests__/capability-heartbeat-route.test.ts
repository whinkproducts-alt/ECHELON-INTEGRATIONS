import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimitStore, setRateLimitStore } from '@/lib/rate-limit';

const recordHeartbeat = vi.fn();
vi.mock('@/lib/api-helpers', () => ({ readJsonBody: async () => ({ body: {} }) }));
vi.mock('@/lib/capability/providers', () => ({ CapabilityInputError: class extends Error { status = 400; } }));
vi.mock('@/lib/capability/hosts', () => ({ recordHeartbeat: (...a: unknown[]) => recordHeartbeat(...a) }));

import { POST } from '@/app/api/integrations/hosts/[id]/heartbeat/route';

const call = (ip: string, token = 'eh_' + 'a'.repeat(43)) =>
  POST(
    new Request('http://localhost/api/integrations/hosts/h1/heartbeat', {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': ip, 'content-type': 'application/json' }, body: '{}',
    }),
    { params: Promise.resolve({ id: 'h1' }) },
  );

describe('CG-10 heartbeat endpoint is rate limited before any database work', () => {
  beforeEach(() => {
    setRateLimitStore(new InMemoryRateLimitStore());
    recordHeartbeat.mockReset();
    recordHeartbeat.mockResolvedValue({ ok: false });
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
  });

  it('answers 429 after 30 requests a minute from one address, without touching the database', async () => {
    for (let i = 0; i < 30; i++) expect((await call('203.0.113.7')).status).toBe(401);
    expect(recordHeartbeat).toHaveBeenCalledTimes(30);
    const blocked = await call('203.0.113.7');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(recordHeartbeat).toHaveBeenCalledTimes(30); // the 31st never reached recordHeartbeat
  });

  it('one address being blocked does not block another', async () => {
    for (let i = 0; i < 31; i++) await call('203.0.113.7');
    expect((await call('198.51.100.9')).status).toBe(401);
  });

  it('a real host heartbeating twice a minute is never limited', async () => {
    recordHeartbeat.mockResolvedValue({ ok: true, status: 'ONLINE', receivedAt: new Date().toISOString() });
    for (let i = 0; i < 4; i++) expect((await call('203.0.113.50')).status).toBe(200);
  });
});
