/**
 * Tenant isolation for /api/evaluations/run against the REAL local Postgres.
 *
 * Real: route handlers, prisma. Mocked: only `@/auth` (the session).
 * If Postgres is unreachable every test skips, so CI without a database stays green.
 */
import { describe, it, expect, vi, beforeAll, afterAll, type TestContext } from 'vitest';

let currentUserId = '';
vi.mock('@/auth', () => ({
  auth: vi.fn(async () => (currentUserId ? { user: { id: currentUserId } } : null)),
}));

type Prisma = typeof import('@/lib/db')['prisma'];
type Route = typeof import('@/app/api/evaluations/run/route');

let prisma: Prisma;
let route: Route;
let dbUp = false;
let userA = '';
let userB = '';
let scenarioId = '';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function need(ctx: TestContext) {
  if (!dbUp) ctx.skip();
}

function postReq(body: unknown) {
  return new Request('http://localhost/api/evaluations/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

async function getMine(userId: string) {
  currentUserId = userId;
  const res = await route.GET();
  expect(res.status).toBe(200);
  const scenarios = (await res.json()) as Array<{ id: string; runs: Array<{ id: string; userId: string; details: string | null }> }>;
  return scenarios.find((s) => s.id === scenarioId);
}

beforeAll(async () => {
  try {
    ({ prisma } = await import('@/lib/db'));
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rej) => setTimeout(() => rej(new Error('db probe timeout')), 4000)),
    ]);
    await prisma.evaluationScenario.count({ where: { id: 'probe' } });
    dbUp = true;
  } catch {
    dbUp = false;
    return;
  }
  route = await import('@/app/api/evaluations/run/route');
  const a = await prisma.user.create({ data: { email: `eval-itest-a-${stamp}@example.test`, name: 'eval A' } });
  const b = await prisma.user.create({ data: { email: `eval-itest-b-${stamp}@example.test`, name: 'eval B' } });
  userA = a.id;
  userB = b.id;
  const s = await prisma.evaluationScenario.create({
    data: {
      category: 'permission_enforcement',
      title: `itest scenario ${stamp}`,
      input: 'x',
      expectedBehavior: 'y',
    },
  });
  scenarioId = s.id;
}, 15000);

afterAll(async () => {
  if (!dbUp) return;
  try {
    await prisma.evaluationRun.deleteMany({ where: { scenarioId } });
    await prisma.evaluationScenario.deleteMany({ where: { id: scenarioId } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB].filter(Boolean) } } });
  } finally {
    await prisma.$disconnect();
  }
}, 15000);

describe('evaluations tenant isolation (real Postgres)', () => {
  it('user B never sees user A runs, and still sees their own', async (ctx) => {
    need(ctx);

    // User A runs the scenario, result X.
    currentUserId = userA;
    const postA = await route.POST(postReq({ scenarioId, result: 'PASS', score: 0.9, details: { marker: 'A-SECRET' } }));
    expect(postA.status).toBe(200);
    const runA = await postA.json();

    // A sees their own run.
    const seenByA = await getMine(userA);
    expect(seenByA?.runs.map((r) => r.id)).toEqual([runA.id]);

    // B makes the same call: nothing from A.
    const seenByBEmpty = await getMine(userB);
    expect(seenByBEmpty).toBeDefined();
    expect(seenByBEmpty!.runs).toEqual([]);

    // B runs the scenario afterwards (A's run is older than... or newer: either way B only gets B's).
    currentUserId = userB;
    const postB = await route.POST(postReq({ scenarioId, result: 'FAIL', score: 0.1, details: { marker: 'B-OWN' } }));
    const runB = await postB.json();
    const seenByB = await getMine(userB);
    expect(seenByB!.runs.map((r) => r.id)).toEqual([runB.id]);
    expect(seenByB!.runs.every((r) => r.userId === userB)).toBe(true);
    expect(JSON.stringify(seenByB)).not.toContain('A-SECRET');

    // A is unaffected by B's newer run (A still gets only A's).
    const seenByAAgain = await getMine(userA);
    expect(seenByAAgain!.runs.map((r) => r.id)).toEqual([runA.id]);
  }, 30000);

  it('unauthenticated GET is rejected', async (ctx) => {
    need(ctx);
    currentUserId = '';
    const res = await route.GET();
    expect(res.status).toBe(401);
  });
});
