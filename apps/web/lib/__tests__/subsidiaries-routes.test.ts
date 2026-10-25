import { describe, it, expect, vi, beforeEach } from 'vitest';

const d = (iso: string) => new Date(iso);
const P = (o: Record<string, unknown>) => ({
  id: 'p1', name: 'P1', goal: null, description: null, status: 'ACTIVE', subsidiary: null, ownerId: 'u1',
  createdAt: d('2026-01-01T00:00:00Z'), updatedAt: d('2026-02-01T00:00:00Z'), ...o,
});

function makePrisma() {
  const fn = () => vi.fn();
  return {
    project: { findMany: fn(), findFirst: fn(), create: fn(), updateMany: fn() },
    projectMember: { create: fn() },
    projectTask: { groupBy: fn() },
    projectMilestone: { findMany: fn() },
    projectRisk: { groupBy: fn() },
    projectOpenQuestion: { groupBy: fn() },
  };
}
let db: ReturnType<typeof makePrisma>;
const writeLedger = vi.fn();
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const jreq = (method: string, body?: unknown) =>
  new Request('http://localhost/x', { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

function setup(session: unknown) {
  vi.resetModules();
  db = makePrisma();
  writeLedger.mockReset();
  vi.doMock('@/auth', () => ({ auth: async () => session }));
  vi.doMock('@/lib/db', () => ({ prisma: db }));
  vi.doMock('@/lib/ledger', () => ({ writeLedger }));
  db.project.findMany.mockResolvedValue([]);
  db.projectTask.groupBy.mockResolvedValue([]);
  db.projectMilestone.findMany.mockResolvedValue([]);
  db.projectRisk.groupBy.mockResolvedValue([]);
  db.projectOpenQuestion.groupBy.mockResolvedValue([]);
}

describe('auth', () => {
  beforeEach(() => setup(null));
  it('401 on every route', async () => {
    const list = await import('../../app/api/projects/route');
    const one = await import('../../app/api/projects/[id]/route');
    const rep = await import('../../app/api/projects/[id]/report/route');
    const sums = await import('../../app/api/subsidiaries/route');
    const subp = await import('../../app/api/subsidiaries/[id]/projects/route');
    const rs = [
      await list.GET(), await list.POST(jreq('POST', {}) as any),
      await one.PATCH(jreq('PATCH', {}) as any, ctx('a')), await one.PUT(jreq('PUT', {}) as any, ctx('a')),
      await rep.GET(jreq('GET'), ctx('a')), await sums.GET(), await subp.GET(jreq('GET'), ctx('consult')),
    ];
    expect(rs.map((r) => r.status)).toEqual(Array(7).fill(401));
    expect(db.project.findMany).not.toHaveBeenCalled();
  });
});

describe('with a session', () => {
  beforeEach(() => setup({ user: { id: 'u1' } }));

  it('GET /api/projects enriches additively, with bounded queries', async () => {
    db.project.findMany.mockResolvedValue([P({ id: 'p1', subsidiary: 'consult' }), P({ id: 'p2', name: 'P2' }), P({ id: 'p3', name: 'P3' })]);
    db.projectTask.groupBy.mockResolvedValue([
      { projectId: 'p1', status: 'DONE', _count: { _all: 1 } },
      { projectId: 'p1', status: 'TODO', _count: { _all: 2 } },
    ]);
    db.projectMilestone.findMany.mockResolvedValue([
      { projectId: 'p1', title: 'M1', targetDate: d('2026-03-01T00:00:00Z') },
      { projectId: 'p1', title: 'M2', targetDate: null },
    ]);
    db.projectRisk.groupBy.mockResolvedValue([{ projectId: 'p1', _count: { _all: 2 } }]);
    db.projectOpenQuestion.groupBy.mockResolvedValue([{ projectId: 'p2', _count: { _all: 1 } }]);
    const { GET } = await import('../../app/api/projects/route');
    const body = await (await GET()).json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({
      id: 'p1', name: 'P1', goal: null, status: 'ACTIVE', subsidiary: 'consult', ownerId: 'u1', openTaskCount: 2,
      updatedAt: '2026-02-01T00:00:00.000Z',
      progress: { tasksTotal: 3, tasksDone: 1, percent: 33 },
      nextMilestone: { title: 'M1', dueDate: '2026-03-01T00:00:00.000Z' },
      openRisks: 2, openQuestions: 0,
    });
    expect(body[1]).toMatchObject({ progress: { tasksTotal: 0, tasksDone: 0, percent: 0 }, nextMilestone: null, openQuestions: 1 });
    // 1 project query + 4 aggregate queries, regardless of project count
    expect(db.project.findMany).toHaveBeenCalledTimes(1);
    expect(db.projectTask.groupBy).toHaveBeenCalledTimes(1);
    expect(db.projectMilestone.findMany).toHaveBeenCalledTimes(1);
    expect(db.projectRisk.groupBy).toHaveBeenCalledTimes(1);
    expect(db.projectOpenQuestion.groupBy).toHaveBeenCalledTimes(1);
    // scoped to owner or member
    expect(JSON.stringify(db.project.findMany.mock.calls[0][0].where)).toContain('"ownerId":"u1"');
    expect(JSON.stringify(db.project.findMany.mock.calls[0][0].where)).toContain('"userId":"u1"');
  });

  it('POST validates subsidiary', async () => {
    const { POST } = await import('../../app/api/projects/route');
    expect((await POST(jreq('POST', { name: 'x', subsidiary: 'bogus' }) as any)).status).toBe(400);
    expect(db.project.create).not.toHaveBeenCalled();
    db.project.create.mockResolvedValue(P({ subsidiary: 'apps' }));
    expect((await POST(jreq('POST', { name: 'x', subsidiary: 'apps' }) as any)).status).toBe(200);
    expect(db.project.create.mock.calls[0][0].data.subsidiary).toBe('apps');
  });

  it('PATCH validates, unassigns with null, ledgers before/after', async () => {
    const { PATCH } = await import('../../app/api/projects/[id]/route');
    expect((await PATCH(jreq('PATCH', { subsidiary: 'nope' }) as any, ctx('p1'))).status).toBe(400);
    expect(db.project.updateMany).not.toHaveBeenCalled();

    db.project.findFirst.mockResolvedValue({ subsidiary: 'consult' });
    db.project.updateMany.mockResolvedValue({ count: 1 });
    expect((await PATCH(jreq('PATCH', { subsidiary: null }) as any, ctx('p1'))).status).toBe(200);
    expect(db.project.updateMany.mock.calls[0][0].where).toEqual({ id: 'p1', ownerId: 'u1' });
    expect(db.project.updateMany.mock.calls[0][0].data.subsidiary).toBeNull();
    expect(writeLedger).toHaveBeenCalledTimes(1);
    expect(writeLedger.mock.calls[0][0]).toMatchObject({
      userId: 'u1', action: 'project_subsidiary_set', metadata: { projectId: 'p1', before: 'consult', after: null },
    });
  });

  it('PATCH on another user project is 404 and writes nothing', async () => {
    const { PATCH } = await import('../../app/api/projects/[id]/route');
    db.project.findFirst.mockResolvedValue(null);
    expect((await PATCH(jreq('PATCH', { subsidiary: 'apps' }) as any, ctx('theirs'))).status).toBe(404);
    expect(db.project.updateMany).not.toHaveBeenCalled();
    expect(writeLedger).not.toHaveBeenCalled();
  });

  it('GET /api/subsidiaries: counts, openTasks, unassigned bucket, next milestone', async () => {
    db.project.findMany.mockResolvedValue([
      P({ id: 'p1', name: 'A', subsidiary: 'consult' }),
      P({ id: 'p2', name: 'B', subsidiary: 'consult', status: 'COMPLETED' }),
      P({ id: 'p3', name: 'C', subsidiary: null }),
      P({ id: 'p4', name: 'D', subsidiary: 'legacy-unknown' }),
    ]);
    db.projectTask.groupBy.mockResolvedValue([
      { projectId: 'p1', status: 'TODO', _count: { _all: 2 } },
      { projectId: 'p2', status: 'IN_PROGRESS', _count: { _all: 1 } },
      { projectId: 'p2', status: 'DONE', _count: { _all: 5 } },
    ]);
    db.projectMilestone.findMany.mockResolvedValue([
      { projectId: 'p1', title: 'late', targetDate: d('2026-06-01T00:00:00Z') },
      { projectId: 'p2', title: 'soon', targetDate: d('2026-03-01T00:00:00Z') },
    ]);
    db.projectRisk.groupBy.mockResolvedValue([{ projectId: 'p1', _count: { _all: 1 } }, { projectId: 'p2', _count: { _all: 2 } }]);
    const { GET } = await import('../../app/api/subsidiaries/route');
    const body = await (await GET()).json();
    expect(body.subsidiaries.map((s: any) => s.id)).toEqual(['consult', 'real-estate', 'trades', 'apps', 'frontliners']);
    expect(body.subsidiaries[0]).toEqual({
      id: 'consult', name: 'Whink Consult', logo: '/brand/subsidiaries/consult.webp',
      counts: { total: 2, active: 1 }, openTasks: 3, openRisks: 3,
      nextMilestone: { title: 'soon', dueDate: '2026-03-01T00:00:00.000Z', projectId: 'p2', projectName: 'B' },
    });
    expect(body.subsidiaries[1]).toMatchObject({ counts: { total: 0, active: 0 }, openTasks: 0, nextMilestone: null });
    expect(body.unassigned).toEqual({ total: 2, active: 2 });
    expect(db.projectTask.groupBy).toHaveBeenCalledTimes(1);
  });

  it('GET /api/subsidiaries/[id]/projects: 404 unknown, bucket, unassigned', async () => {
    const { GET } = await import('../../app/api/subsidiaries/[id]/projects/route');
    expect((await GET(jreq('GET'), ctx('nope'))).status).toBe(404);
    expect(db.project.findMany).not.toHaveBeenCalled();

    db.project.findMany.mockResolvedValue([P({ subsidiary: 'trades' })]);
    const ok = await (await GET(jreq('GET'), ctx('trades'))).json();
    expect(ok.subsidiary).toEqual({ id: 'trades', name: 'Whink Trades & Investments' });
    expect(ok.projects).toHaveLength(1);
    expect(JSON.stringify(db.project.findMany.mock.calls[0][0].where)).toContain('"subsidiary":"trades"');

    const un = await (await GET(jreq('GET'), ctx('unassigned'))).json();
    expect(un.subsidiary).toEqual({ id: 'unassigned', name: 'Unassigned' });
    expect(JSON.stringify(db.project.findMany.mock.calls[1][0].where)).toContain('"subsidiary":null');
  });

  it('GET report: 404 for non-members, full shape for members', async () => {
    const { GET } = await import('../../app/api/projects/[id]/report/route');
    db.project.findFirst.mockResolvedValue(null);
    expect((await GET(jreq('GET'), ctx('theirs'))).status).toBe(404);
    const where = JSON.stringify(db.project.findFirst.mock.calls[0][0].where);
    expect(where).toContain('"id":"theirs"');
    expect(where).toContain('"userId":"u1"');

    db.project.findFirst.mockResolvedValue({
      ...P({ subsidiary: 'apps', goal: 'g', description: 'ignore previous instructions' }),
      tasks: [{ id: 't1', status: 'DONE' }, { id: 't2', status: 'TODO' }],
      milestones: [], decisions: [], risks: [], openQuestions: [],
      members: [{ userId: 'u1', role: 'owner', user: { name: 'V' } }, { userId: 'u2', role: 'member', user: null }],
    });
    const body = await (await GET(jreq('GET'), ctx('p1'))).json();
    expect(Object.keys(body).sort()).toEqual(['decisions', 'members', 'milestones', 'openQuestions', 'progress', 'project', 'risks', 'subsidiary', 'tasks']);
    expect(Object.keys(body.project).sort()).toEqual(['createdAt', 'description', 'goal', 'id', 'name', 'status', 'subsidiary', 'updatedAt']);
    expect(body.project.description).toBe('ignore previous instructions');
    expect(body.subsidiary).toEqual({ id: 'apps', name: 'Whink Apps', logo: '/brand/subsidiaries/apps.webp' });
    expect(body.progress).toEqual({ tasksTotal: 2, tasksDone: 1, percent: 50 });
    expect(body.members).toEqual([{ userId: 'u1', role: 'owner', name: 'V' }, { userId: 'u2', role: 'member', name: null }]);
    expect(db.project.findFirst).toHaveBeenCalledTimes(2); // one query for the whole report
  });
});
