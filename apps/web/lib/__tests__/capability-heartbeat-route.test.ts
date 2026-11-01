import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryRateLimitStore, setRateLimitStore } from '@/lib/rate-limit';

const recordHeartbeat = vi.fn();
vi.mock('@/lib/api-helpers', () => ({
  // Same contract as the real helper: JSON only, otherwise an error response.
  readJsonBody: async (req: Request) => {
    if (!(req.headers.get('content-type') ?? '').includes('application/json')) return { response: new Response('{"error":"Content-Type must be application/json"}', { status: 415 }) };
    try { return { body: JSON.parse(await req.text()) }; } catch { return { response: new Response('{"error":"Invalid JSON"}', { status: 400 }) }; }
  },
}));
vi.mock('@/lib/capability/providers', () => ({ CapabilityInputError: class extends Error { status = 400; } }));
vi.mock('@/lib/capability/hosts', () => ({ recordHeartbeat: (...a: unknown[]) => recordHeartbeat(...a) }));

import { POST } from '@/app/api/integrations/hosts/[id]/heartbeat/route';

const TOKEN = 'eh_' + 'a'.repeat(43);
const call = (ip: string, opts: { token?: string | null; body?: string; type?: string } = {}) =>
  POST(
    new Request('http://localhost/api/integrations/hosts/h1/heartbeat', {
      method: 'POST',
      headers: {
        ...(opts.token === null ? {} : { authorization: `Bearer ${opts.token ?? TOKEN}` }),
        'x-forwarded-for': ip, 'content-type': opts.type ?? 'application/json',
      },
      body: opts.body ?? '{}',
    }),
    { params: Promise.resolve({ id: 'h1' }) },
  );

describe('heartbeat endpoint: failures are rate limited, valid hosts never are', () => {
  beforeEach(() => {
    setRateLimitStore(new InMemoryRateLimitStore());
    recordHeartbeat.mockReset();
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
  });

  it('answers 429 once one address has failed 30 times in a minute', async () => {
    recordHeartbeat.mockResolvedValue({ ok: false });
    for (let i = 0; i < 30; i++) expect((await call('203.0.113.7')).status).toBe(401);
    const blocked = await call('203.0.113.7');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect((await call('198.51.100.9')).status).toBe(401); // another address is unaffected
  });

  it('QODO-11: a flood of failures can never lock out a real host, even from the same address or with no trusted address at all', async () => {
    recordHeartbeat.mockResolvedValue({ ok: false });
    for (let i = 0; i < 40; i++) await call('203.0.113.7', { token: null });
    expect((await call('203.0.113.7', { token: null })).status).toBe(429);
    recordHeartbeat.mockResolvedValue({ ok: true, status: 'ONLINE', receivedAt: new Date().toISOString() });
    for (let i = 0; i < 5; i++) expect((await call('203.0.113.7')).status).toBe(200);
    // no trusted proxy: failures share one route bucket (600/min); valid heartbeats still pass after it is exhausted
    vi.stubEnv('TRUSTED_PROXY_HOPS', '');
    recordHeartbeat.mockResolvedValue({ ok: false });
    for (let i = 0; i < 601; i++) await call('1.1.1.1', { token: null });
    expect((await call('1.1.1.1', { token: null })).status).toBe(429);
    recordHeartbeat.mockResolvedValue({ ok: true, status: 'ONLINE', receivedAt: new Date().toISOString() });
    expect((await call('2.2.2.2')).status).toBe(200);
  });

  it('a request with no bearer token never reaches the database', async () => {
    expect((await call('203.0.113.8', { token: null })).status).toBe(401);
    expect(recordHeartbeat).not.toHaveBeenCalled();
  });

  it('QODO: malformed bodies with a well-formed token are failures too, so they cannot be sent without limit', async () => {
    recordHeartbeat.mockResolvedValue({ ok: true, status: 'ONLINE', receivedAt: new Date().toISOString() });
    for (let i = 0; i < 30; i++) expect((await call('203.0.113.20', { body: '{bad' })).status).toBe(400);
    expect((await call('203.0.113.20', { body: '{bad' })).status).toBe(429);
    expect((await call('203.0.113.20', { type: 'text/plain', body: 'x' })).status).toBe(429);
    expect((await call('203.0.113.20')).status).toBe(200); // a good heartbeat from the same address still passes
    expect(recordHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('QODO-5: a malformed or wrongly typed body is an error and never becomes an empty heartbeat', async () => {
    recordHeartbeat.mockResolvedValue({ ok: true, status: 'ONLINE', receivedAt: new Date().toISOString() });
    expect((await call('203.0.113.9', { body: '{not json' })).status).toBe(400);
    expect((await call('203.0.113.9', { type: 'text/plain', body: 'x' })).status).toBe(415);
    expect(recordHeartbeat).not.toHaveBeenCalled();
    expect((await call('203.0.113.9', { body: '{"capabilities":{"a":1}}' })).status).toBe(200);
    expect(recordHeartbeat).toHaveBeenCalledWith('h1', TOKEN, { capabilities: { a: 1 } });
  });
});
