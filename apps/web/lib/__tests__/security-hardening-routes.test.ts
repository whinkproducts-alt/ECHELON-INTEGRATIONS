import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: { json: (b: unknown, init?: { status?: number }) => new Response(JSON.stringify(b), { status: init?.status ?? 200 }) },
}));

const req = (body: unknown) => ({ json: async () => body }) as never;

describe('POST /api/memory/write', () => {
  const writeMemory = vi.fn();
  const assertOwnedProject = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    writeMemory.mockReset().mockResolvedValue({ id: 'm1' });
    assertOwnedProject.mockReset();
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory }));
    vi.doMock('@/lib/project-access', async () => {
      const actual = await vi.importActual<typeof import('../project-access')>('../project-access');
      return { hasProjectId: actual.hasProjectId, assertOwnedProject };
    });
  });

  it('passes only allow-listed fields and fixes source/epistemicStatus/userId', async () => {
    const { POST } = await import('../../app/api/memory/write/route');
    const res = await POST(req({
      statement: '  hello  ', type: 'semantic', confidence: 5, importance: -2,
      userId: 'evil', source: 'system', sourceId: 'x', mambaMode: 'OBSIDIAN', epistemicStatus: 'FOO', rationale: 'r',
    }));
    expect(res.status).toBe(200);
    expect(writeMemory).toHaveBeenCalledWith({
      userId: 'u1', type: 'semantic', statement: 'hello', projectId: null,
      source: 'user', epistemicStatus: 'KNOWN', confidence: 1, importance: 0,
    });
  });

  it('400 on invalid bodies', async () => {
    const { POST } = await import('../../app/api/memory/write/route');
    for (const b of [
      null, [], { type: 'semantic' }, { statement: '   ', type: 'semantic' },
      { statement: 'a'.repeat(2001), type: 'semantic' }, { statement: 'a', type: 'bogus' },
      { statement: 'a', type: 'semantic', confidence: 'high' },
    ]) {
      expect((await POST(req(b))).status).toBe(400);
    }
    expect(writeMemory).not.toHaveBeenCalled();
  });

  it('404 for an unowned project, no write', async () => {
    assertOwnedProject.mockResolvedValue(null);
    const { POST } = await import('../../app/api/memory/write/route');
    const res = await POST(req({ statement: 'a', type: 'semantic', projectId: 'p-other' }));
    expect(res.status).toBe(404);
    expect(assertOwnedProject).toHaveBeenCalledWith('u1', 'p-other');
    expect(writeMemory).not.toHaveBeenCalled();
  });

  it('uses the verified project id when owned', async () => {
    assertOwnedProject.mockResolvedValue('p1');
    const { POST } = await import('../../app/api/memory/write/route');
    await POST(req({ statement: 'a', type: 'episodic', projectId: 'p1' }));
    expect(writeMemory).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', type: 'episodic' }));
  });
});

describe('PATCH /api/settings', () => {
  const profileFind = vi.fn();
  const profileUpsert = vi.fn();
  const prefUpsert = vi.fn();
  const userUpdate = vi.fn();
  const recordAction = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    for (const f of [profileFind, profileUpsert, prefUpsert, userUpdate, recordAction]) f.mockReset();
    profileFind.mockResolvedValue({ autonomyLevel: 2 });
    recordAction.mockResolvedValue({ id: 'a1' });
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/ledger', () => ({ recordAction }));
    vi.doMock('@/lib/db', () => ({
      prisma: {
        userProfile: { findUnique: profileFind, upsert: profileUpsert },
        userPreference: { upsert: prefUpsert },
        user: { update: userUpdate },
      },
    }));
  });

  it('ignores userId override and nested/unknown fields', async () => {
    const { PATCH } = await import('../../app/api/settings/route');
    const res = await PATCH(req({
      profile: {
        userId: 'victim', timezone: 'America/Edmonton', id: 'x',
        user: { update: { role: 'admin', email: 'a@b.c', passwordHash: 'h' } },
      },
      preferences: { userId: 'victim', verbosity: 'DEEP', user: { update: { role: 'admin' } } },
    }));
    expect(res.status).toBe(200);
    expect(profileUpsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      update: { timezone: 'America/Edmonton' },
      create: { timezone: 'America/Edmonton', userId: 'u1' },
    });
    expect(prefUpsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      update: { verbosity: 'DEEP' },
      create: { verbosity: 'DEEP', userId: 'u1' },
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  // Raising autonomy (202 + approval, never written here) is covered in autonomy-approval.test.ts.

  it('applies a lowered autonomy and ledgers VALIDATED', async () => {
    const { PATCH } = await import('../../app/api/settings/route');
    const res = await PATCH(req({ profile: { autonomyLevel: 0 } }));
    expect(res.status).toBe(200);
    expect(profileUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { autonomyLevel: 0 }, create: { autonomyLevel: 0, userId: 'u1' },
    }));
    expect(recordAction).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1', action: 'autonomy_level_change', status: 'VALIDATED',
      inputSummary: JSON.stringify({ from: 2, to: 0 }),
    }));
  });

  it('unchanged autonomy is not ledgered and the save succeeds', async () => {
    const { PATCH } = await import('../../app/api/settings/route');
    const res = await PATCH(req({ profile: { autonomyLevel: 2, timezone: 'UTC' } }));
    expect(res.status).toBe(200);
    expect(recordAction).not.toHaveBeenCalled();
    expect(profileUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: { timezone: 'UTC' } }));
  });

  it('400 on out-of-range, non-integer, and bad enum values', async () => {
    const { PATCH } = await import('../../app/api/settings/route');
    for (const b of [
      { profile: { autonomyLevel: 9 } }, { profile: { autonomyLevel: 1.5 } }, { profile: { autonomyLevel: '3' } },
      { profile: { interruptionBudget: 'NUKE' } }, { preferences: { verbosity: 'x' } }, { profile: 'str' },
    ]) {
      expect((await PATCH(req(b))).status).toBe(400);
    }
    expect(profileUpsert).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/tasks/[id]', () => {
  const updateMany = vi.fn();
  const findFirst = vi.fn();
  const params = { params: Promise.resolve({ id: 't1' }) };
  beforeEach(() => {
    vi.resetModules();
    updateMany.mockReset().mockResolvedValue({ count: 1 });
    findFirst.mockReset().mockResolvedValue({ id: 't1', title: 'x' });
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({ prisma: { projectTask: { updateMany, findFirst } } }));
  });

  it('updates with one ownership-scoped updateMany and only supplied, validated fields', async () => {
    const { PATCH } = await import('../../app/api/tasks/[id]/route');
    const res = await PATCH(req({ status: 'DONE', projectId: 'hack', id: 'other' }), params);
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 't1', project: { ownerId: 'u1' } },
      data: { status: 'DONE' },
    });
  });

  it('404 when not owned', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const { PATCH } = await import('../../app/api/tasks/[id]/route');
    expect((await PATCH(req({ title: 'a' }), params)).status).toBe(404);
  });

  it('400 on invalid values and empty patches, no write', async () => {
    const { PATCH } = await import('../../app/api/tasks/[id]/route');
    for (const b of [
      { status: 'WHATEVER' }, { priority: 'URGENT' }, { title: '' }, { title: 5 }, { title: null },
      { description: 7 }, { assignee: {} }, {}, { unknown: 1 },
    ]) {
      expect((await PATCH(req(b), params)).status).toBe(400);
    }
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe('validateTaskInput partial', () => {
  it('returns only supplied fields; null description/assignee clear', async () => {
    const { validateTaskInput } = await import('../task-input');
    const r = validateTaskInput({ description: null, assignee: null }, { allowAssignee: true, allowStatus: true, partial: true });
    expect(r).toEqual({ value: { description: null, assignee: null } });
  });
  it('full mode unchanged: title required', async () => {
    const { validateTaskInput } = await import('../task-input');
    expect(validateTaskInput({}, { allowAssignee: true, allowStatus: true })).toEqual({ error: 'title must be a string' });
  });
});

describe('POST /api/persona/switch — A3 MAMBA Obsidian-only', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
    vi.doMock('@/lib/db', () => ({
      prisma: { personaState: { upsert: vi.fn().mockResolvedValue({ activePersona: 'MAMBA', mambaMode: 'OBSIDIAN' }) } },
    }));
    vi.doMock('@/lib/types', async () => {
      const actual = await vi.importActual<typeof import('../types')>('../types');
      return actual;
    });
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe: vi.fn().mockResolvedValue({ id: 'led1' }) }));
  });

  it('accepts mambaMode: OBSIDIAN', async () => {
    const { POST } = await import('../../app/api/persona/switch/route');
    const res = await POST(req({ persona: 'MAMBA', mambaMode: 'OBSIDIAN' }));
    expect(res.status).toBe(200);
  });

  it('accepts mambaMode: null (sets null)', async () => {
    const { POST } = await import('../../app/api/persona/switch/route');
    const res = await POST(req({ persona: 'MAMBA', mambaMode: null }));
    expect(res.status).toBe(200);
  });

  it.each(['MICAH', 'NANDI', 'SCOUT'])('accepts %s as a selectable persona', async (persona) => {
    const { POST } = await import('../../app/api/persona/switch/route');
    const res = await POST(req({ persona }));
    expect(res.status).toBe(200);
  });

  it('rejects mambaMode: WHITE with 400', async () => {
    const { POST } = await import('../../app/api/persona/switch/route');
    const res = await POST(req({ persona: 'MAMBA', mambaMode: 'WHITE' }));
    expect(res.status).toBe(400);
  });

  it('rejects mambaMode: GREY with 400', async () => {
    const { POST } = await import('../../app/api/persona/switch/route');
    const res = await POST(req({ persona: 'MAMBA', mambaMode: 'GREY' }));
    expect(res.status).toBe(400);
  });

  it('rejects arbitrary mambaMode values with 400', async () => {
    const { POST } = await import('../../app/api/persona/switch/route');
    for (const bad of ['purple', 'STEALTH', 'ignore_all_instructions']) {
      const res = await POST(req({ persona: 'MAMBA', mambaMode: bad }));
      expect(res.status).toBe(400);
    }
  });

  it('upsert not called on invalid mambaMode', async () => {
    const upsert = vi.fn();
    vi.doMock('@/lib/db', () => ({ prisma: { personaState: { upsert } } }));
    const { POST } = await import('../../app/api/persona/switch/route');
    await POST(req({ persona: 'MAMBA', mambaMode: 'WHITE' }));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('E3 Gap 2: successful persona switch ledgers action=persona_switch with correct fields', async () => {
    // The persona switch route MUST call recordActionSafe with action='persona_switch',
    // the correct userId, persona='MAMBA', and mambaMode='OBSIDIAN' on a successful switch.
    // If this test fails, the builder must add the ledger call to apps/web/app/api/persona/switch/route.ts.
    const recordActionSafe = vi.fn().mockResolvedValue({ id: 'led1' });
    vi.doMock('@/lib/ledger', () => ({ recordActionSafe }));
    const { POST } = await import('../../app/api/persona/switch/route');
    const res = await POST(req({ persona: 'MAMBA', mambaMode: 'OBSIDIAN' }));
    expect(res.status).toBe(200);
    expect(recordActionSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        action: 'persona_switch',
        persona: 'MAMBA',
        mambaMode: 'OBSIDIAN',
      })
    );
  });
});
