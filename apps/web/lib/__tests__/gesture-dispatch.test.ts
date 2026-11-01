import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GESTURE_TYPES, type Recognition, type GestureType } from '@/lib/gesture/types';
import { INTENTS } from '@/lib/gesture/intents';
import { HoloBridge } from '@/lib/gesture/holo-bridge';

const checkPermission = vi.fn();
const recordAction = vi.fn();
const createApproval = vi.fn();
const taskFind = vi.fn();
const personaFind = vi.fn();

vi.mock('@/lib/permission-engine', () => ({ checkPermission: (...a: unknown[]) => checkPermission(...a) }));
vi.mock('@/lib/ledger', () => ({ recordAction: (...a: unknown[]) => recordAction(...a) }));
vi.mock('@/lib/approvals', () => ({ createApproval: (...a: unknown[]) => createApproval(...a) }));
vi.mock('@/lib/db', () => ({
  prisma: { projectTask: { findFirst: (...a: unknown[]) => taskFind(...a) }, personaState: { findUnique: (...a: unknown[]) => personaFind(...a) } },
}));
vi.mock('@/lib/task-gate', () => ({
  extractRequiredSkills: (t: string) => (/\bsocial\b/i.test(t) ? ['social_media_management', 'web_research'] : []),
}));
vi.mock('@whink/org-kit', () => ({ getAgent: vi.fn() }));

const { dispatchGesture, buildPointEar } = await import('@/lib/gesture/dispatch');

const rec = (gesture: GestureType, total = 250, detail: Recognition['detail'] = {}): Recognition => ({
  gesture, detail,
  confidence: { base: 100, stability: 60, geometry: 40, temporal: 50, encoder: 0, total },
});
const agent = { id: 'a1', name: 'Aarav', directorate: 'Exec', department: 'CEO', skills: ['web_research'], available: true };
let bridge: HoloBridge;
const deps = () => ({
  bridge,
  agents: { get: (id: string) => (id === 'a1' ? agent : id === 'a_off' ? { ...agent, id: 'a_off', available: false } : null) },
  now: () => 1000,
});

beforeEach(() => {
  vi.clearAllMocks();
  bridge = new HoloBridge();
  checkPermission.mockResolvedValue({ allowed: true, method: 'auto' });
  recordAction.mockResolvedValue({ id: 'l1' });
  personaFind.mockResolvedValue({ activePersona: 'WHINK', mambaMode: null });
  taskFind.mockResolvedValue({ id: 't1', title: 'Plan social launch', description: null });
  createApproval.mockResolvedValue({ id: 'ap1' });
});

describe('intent table', () => {
  it('covers all 10 gestures, none is Class C, thresholds sit under the reachable 250', () => {
    for (const g of GESTURE_TYPES) {
      const d = INTENTS[g];
      expect(d).toBeTruthy();
      expect(['A', 'B']).toContain(d.permissionClass);
      expect(d.minConfidence).toBeLessThanOrEqual(250);
    }
  });
  it('is frozen', () => {
    expect(() => { (INTENTS.pinch as any).permissionClass = 'A'; (INTENTS as any).pinch = null; }).toThrow();
  });
  it('no intent name or capability can decide an approval', () => {
    for (const g of GESTURE_TYPES) expect(INTENTS[g].capability).not.toMatch(/approv|decide|ear_/);
  });
});

describe('dispatch', () => {
  it('below the threshold does nothing but is ledgered', async () => {
    const r = await dispatchGesture('u1', rec('pinch', 150), {}, 'c1', deps());
    expect(r.status).toBe('below_threshold');
    expect(checkPermission).not.toHaveBeenCalled();
    expect(recordAction.mock.calls[0][0]).toMatchObject({ userId: 'u1', status: 'DENIED', correlationId: 'c1' });
  });

  it('ledger failure prevents the gesture from being applied', async () => {
    recordAction.mockRejectedValue(new Error('db down'));
    const before = bridge.getState('u1').version;
    await expect(dispatchGesture('u1', rec('palm'), {}, 'c1', deps())).rejects.toThrow('ledger unavailable');
    expect(bridge.getState('u1').mode).not.toBe('paused');
    expect(bridge.getState('u1').version).toBe(before);
  });

  it('ledger row is written before the gesture applies', async () => {
    let modeAtWrite = '';
    recordAction.mockImplementation(async () => { modeAtWrite = bridge.getState('u1').mode; return { id: 'l1' }; });
    await dispatchGesture('u1', rec('palm'), {}, 'c1', deps());
    expect(modeAtWrite).not.toBe('paused');
    expect(bridge.getState('u1').mode).toBe('paused');
  });

  it('asks the permission engine before acting and ledgers the run', async () => {
    const r = await dispatchGesture('u1', rec('palm'), {}, 'c1', deps());
    expect(checkPermission).toHaveBeenCalledWith('u1', 'gesture_pause', 'A', 'c1');
    expect(r.status).toBe('executed');
    expect(bridge.getState('u1').mode).toBe('paused');
    const row = recordAction.mock.calls[0][0];
    expect(row).toMatchObject({ userId: 'u1', status: 'VALIDATED', permissionClass: 'A', correlationId: 'c1', initiator: 'user' });
    expect(JSON.stringify(row)).not.toMatch(/landmark/i);
  });

  it('a refusal from the permission engine blocks the action and is ledgered DENIED', async () => {
    checkPermission.mockResolvedValue({ allowed: false, method: 'requires_confirmation', reason: 'Class B needs delegation' });
    const r = await dispatchGesture('u1', rec('crush'), {}, 'c1', deps());
    expect(r.status).toBe('denied');
    expect(bridge.getState('u1').briefRequestedAt).toBeNull();
    expect(recordAction.mock.calls[0][0]).toMatchObject({ status: 'DENIED', permissionClass: 'B' });
  });

  it('crush is Class B and sets the brief request when permitted', async () => {
    const r = await dispatchGesture('u1', rec('crush'), {}, 'c1', deps());
    expect(checkPermission).toHaveBeenCalledWith('u1', 'gesture_request_brief', 'B', 'c1');
    expect(r.status).toBe('executed');
    expect(bridge.getState('u1').briefRequestedAt).toBe(1000);
  });

  it('pinch with a task the user does not own is rejected, and the lookup is scoped to the owner', async () => {
    taskFind.mockResolvedValue(null);
    const r = await dispatchGesture('u1', rec('pinch'), { target: { taskId: 'other' } }, 'c1', deps());
    expect(r.status).toBe('rejected');
    expect(taskFind.mock.calls[0][0].where).toMatchObject({ id: 'other', project: { ownerId: 'u1' } });
    expect(bridge.getState('u1').openTaskId).toBeNull();
  });

  it('pinch opens a verified thread', async () => {
    await dispatchGesture('u1', rec('pinch'), { target: { taskId: 't1' } }, 'c1', deps());
    expect(bridge.getState('u1')).toMatchObject({ openTaskId: 't1', mode: 'active' });
  });

  it('point needs an open thread and a target agent', async () => {
    expect((await dispatchGesture('u1', rec('point'), { target: { agentId: 'a1' } }, 'c1', deps())).status).toBe('needs_context');
    await dispatchGesture('u1', rec('pinch'), { target: { taskId: 't1' } }, 'c1', deps());
    expect((await dispatchGesture('u1', rec('point'), {}, 'c2', deps())).status).toBe('needs_context');
    expect(createApproval).not.toHaveBeenCalled();
    expect(recordAction.mock.calls.filter((c) => /needs_context/.test(c[0].outputSummary))).toHaveLength(2);
  });

  it('point creates an EAR approval and never runs the work', async () => {
    await dispatchGesture('u1', rec('pinch'), { target: { taskId: 't1' } }, 'c1', deps());
    const r = await dispatchGesture('u1', rec('point'), { target: { agentId: 'a1' } }, 'c2', deps());
    expect(r.status).toBe('executed');
    expect(r.approvalId).toBe('ap1');
    expect(r.skillMatch).toEqual({ required: ['social_media_management', 'web_research'], matched: ['web_research'], gaps: ['social_media_management'] });
    const arg = createApproval.mock.calls[0][0];
    expect(arg.kind).toBe('ear');
    expect(arg.params).toMatchObject({ lead_agent: 'Aarav', execution_allowed: false, approval_required: true, taskId: 't1', source: 'gesture' });
    expect(bridge.getState('u1').pendingApprovalId).toBe('ap1');
  });

  it('point at an unavailable or unknown agent is rejected', async () => {
    await dispatchGesture('u1', rec('pinch'), { target: { taskId: 't1' } }, 'c1', deps());
    for (const id of ['a_off', 'ghost']) {
      expect((await dispatchGesture('u1', rec('point'), { target: { agentId: id } }, 'c2', deps())).status).toBe('rejected');
    }
    expect(createApproval).not.toHaveBeenCalled();
  });

  it('a failed approval is ledgered FAILED and the HOLO state does not move', async () => {
    await dispatchGesture('u1', rec('pinch'), { target: { taskId: 't1' } }, 'c1', deps());
    const v = bridge.getState('u1').version;
    createApproval.mockRejectedValue(new Error('ledger down'));
    const r = await dispatchGesture('u1', rec('point'), { target: { agentId: 'a1' } }, 'c2', deps());
    expect(r.status).toBe('failed');
    expect(bridge.getState('u1').version).toBe(v);
    expect(recordAction.mock.calls.at(-1)![0]).toMatchObject({ status: 'FAILED' });
  });

  it('while paused only wave is accepted', async () => {
    await dispatchGesture('u1', rec('palm'), {}, 'c1', deps());
    recordAction.mockClear();
    expect((await dispatchGesture('u1', rec('peace'), {}, 'c2', deps())).status).toBe('ignored_paused');
    expect(recordAction).toHaveBeenCalledTimes(1);
    expect((await dispatchGesture('u1', rec('wave'), {}, 'c3', deps())).status).toBe('executed');
    expect(bridge.getState('u1').mode).toBe('active');
  });

  it('flick direction moves focus and never below zero', async () => {
    await dispatchGesture('u1', rec('flick', 250, { direction: 'right' }), {}, 'c', deps());
    await dispatchGesture('u1', rec('flick', 250, { direction: 'right' }), {}, 'c', deps());
    expect(bridge.getState('u1').focusIndex).toBe(2);
    for (let i = 0; i < 5; i++) await dispatchGesture('u1', rec('flick', 250, { direction: 'left' }), {}, 'c', deps());
    expect(bridge.getState('u1').focusIndex).toBe(0);
  });

  it('thumbs up selects a focus but approves nothing', async () => {
    await dispatchGesture('u1', rec('thumbs_up'), { target: { agentId: 'a1' } }, 'c', deps());
    expect(bridge.getState('u1').focusedAgentId).toBe('a1');
    expect(createApproval).not.toHaveBeenCalled();
    // an unknown agent id from the client is ignored, not stored
    await dispatchGesture('u1', rec('thumbs_up'), { target: { agentId: 'ghost' } }, 'c', deps());
    expect(bridge.getState('u1').focusedAgentId).toBe('a1');
  });

  it('state is per user', async () => {
    await dispatchGesture('u1', rec('palm'), {}, 'c', deps());
    expect(bridge.getState('u2').mode).toBe('idle');
  });
});

describe('buildPointEar', () => {
  it('puts the pointed agent in the lead and keeps execution blocked', () => {
    const { ear } = buildPointEar({ title: 'x\u0000\ny'.repeat(100), description: null }, agent);
    expect(ear.lead_agent).toBe('Aarav');
    expect(ear.objective.length).toBeLessThanOrEqual(200);
    expect(ear.objective).not.toMatch(/[\u0000-\u001f]/);
    expect(ear.execution_allowed).toBe(false);
  });
});
