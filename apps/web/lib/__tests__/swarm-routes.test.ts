import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ user: 'userA' as string | null, svc: {} as Record<string, any>, limited: false }));
vi.mock('@/auth', () => ({ auth: async () => (h.user ? { user: { id: h.user } } : null) }));
vi.mock('@/lib/rate-limit', () => ({ limitOr429: async () => (h.limited ? new Response('{}', { status: 429 }) : null) }));
vi.mock('@/lib/swarm/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/swarm/service')>('@/lib/swarm/service');
  return {
    PlanInputSchema: actual.PlanInputSchema,
    createPlan: (...a: unknown[]) => h.svc.createPlan(...a),
    listRuns: (...a: unknown[]) => h.svc.listRuns(...a),
    getRun: (...a: unknown[]) => h.svc.getRun(...a),
    startRun: (...a: unknown[]) => h.svc.startRun(...a),
    cancelRun: (...a: unknown[]) => h.svc.cancelRun(...a),
  };
});

import * as root from '@/app/api/swarm/route';
import * as one from '@/app/api/swarm/[id]/route';
import * as start from '@/app/api/swarm/[id]/start/route';
import * as cancel from '@/app/api/swarm/[id]/cancel/route';

const ctx = { params: Promise.resolve({ id: 'r1' }) };
const post = (body: unknown) => new Request('http://x/api/swarm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

beforeEach(() => {
  h.user = 'userA'; h.limited = false;
  h.svc = {
    createPlan: vi.fn(async () => ({ ok: true, value: { run: { id: 'r1' } } })),
    listRuns: vi.fn(async () => []),
    getRun: vi.fn(async () => null),
    startRun: vi.fn(async () => ({ ok: false, status: 404, error: 'Not found' })),
    cancelRun: vi.fn(async () => ({ ok: false, status: 404, error: 'Not found' })),
  };
});

describe('swarm routes', () => {
  it('401 without a session on every route', async () => {
    h.user = null;
    expect((await root.GET()).status).toBe(401);
    expect((await root.POST(post({ initiative: 'x' }))).status).toBe(401);
    expect((await one.GET(new Request('http://x'), ctx)).status).toBe(401);
    expect((await start.POST(new Request('http://x', { method: 'POST' }), ctx)).status).toBe(401);
    expect((await cancel.POST(new Request('http://x', { method: 'POST' }), ctx)).status).toBe(401);
    expect(h.svc.createPlan).not.toHaveBeenCalled();
  });
  it('400 on invalid bodies', async () => {
    for (const b of [{}, { initiative: '' }, { initiative: 'x', minAgents: 5 }, { initiative: 'x', extra: 1 }, { initiative: 'x'.repeat(4001) }]) {
      expect((await root.POST(post(b))).status).toBe(400);
    }
    const bad = new Request('http://x', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' });
    expect((await root.POST(bad)).status).toBe(415);
  });
  it('plans with the session user, never a body user', async () => {
    const r = await root.POST(post({ initiative: 'x', userId: 'evil' }));
    expect(r.status).toBe(400);
    const ok = await root.POST(post({ initiative: 'x' }));
    expect(ok.status).toBe(201);
    expect(h.svc.createPlan.mock.calls[0][0]).toBe('userA');
  });
  it('429 when rate limited', async () => {
    h.limited = true;
    expect((await root.POST(post({ initiative: 'x' }))).status).toBe(429);
    expect((await start.POST(new Request('http://x', { method: 'POST' }), ctx)).status).toBe(429);
  });
  it('404 for runs the user does not own', async () => {
    expect((await one.GET(new Request('http://x'), ctx)).status).toBe(404);
    expect((await start.POST(new Request('http://x', { method: 'POST' }), ctx)).status).toBe(404);
    expect((await cancel.POST(new Request('http://x', { method: 'POST' }), ctx)).status).toBe(404);
    expect(h.svc.getRun).toHaveBeenCalledWith('userA', 'r1');
  });
  it('start maps the budget refusal to 409 with a code', async () => {
    h.svc.startRun.mockResolvedValue({ ok: false, status: 409, error: 'Refused', code: 'budget_hard_limit' });
    const r = await start.POST(new Request('http://x', { method: 'POST' }), ctx);
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe('budget_hard_limit');
  });
});
