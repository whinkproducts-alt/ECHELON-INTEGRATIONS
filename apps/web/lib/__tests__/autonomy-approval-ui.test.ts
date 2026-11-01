import { describe, it, expect } from 'vitest';
import {
  parseAutonomyApproval,
  pickPendingAutonomy,
  interpretPatchResponse,
  resolveDecision,
} from '@/lib/autonomy-approval';
import type { DecisionStatus } from '@/lib/hooks/approval-state';

function approval(over: Record<string, unknown> = {}) {
  return {
    id: 'ap_1',
    kind: 'autonomy_change',
    tool: null,
    summary: 'Raise autonomy from 1 to 2',
    params: { from: 1, to: 2 },
    contentHash: 'abc123',
    permissionClass: 'C',
    createdAt: '2026-10-03T10:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('parseAutonomyApproval', () => {
  it('parses a valid approval and maps to a tool_call view', () => {
    const a = parseAutonomyApproval(approval());
    expect(a).not.toBeNull();
    expect(a!.from).toBe(1);
    expect(a!.to).toBe(2);
    expect(a!.view.kind).toBe('tool_call');
    expect(a!.view.tool).toBe('autonomy_change');
    expect(a!.view.id).toBe('ap_1');
    expect(a!.view.permissionClass).toBe('C');
    expect(a!.view.contentHash).toBe('abc123');
  });

  it('defaults missing contentHash and permissionClass', () => {
    const a = parseAutonomyApproval(approval({ contentHash: undefined, permissionClass: undefined }));
    expect(a!.view.contentHash).toBe('');
    expect(a!.view.permissionClass).toBe('C');
  });

  it.each([null, undefined, 'x', 5, []])('rejects non-object %p', (v) => {
    expect(parseAutonomyApproval(v)).toBeNull();
  });

  it('rejects wrong kind', () => {
    expect(parseAutonomyApproval(approval({ kind: 'tool_call' }))).toBeNull();
    expect(parseAutonomyApproval(approval({ kind: 'ear' }))).toBeNull();
    expect(parseAutonomyApproval(approval({ kind: undefined }))).toBeNull();
  });

  it('rejects missing or invalid params', () => {
    expect(parseAutonomyApproval(approval({ params: undefined }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: null }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: [1, 2] }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: { from: 1 } }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: { to: 2 } }))).toBeNull();
  });

  it('rejects non-integer or non-number from/to', () => {
    expect(parseAutonomyApproval(approval({ params: { from: 1.5, to: 2 } }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: { from: 1, to: 2.5 } }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: { from: '1', to: 2 } }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: { from: 1, to: null } }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: { from: NaN, to: 2 } }))).toBeNull();
  });

  it('rejects out-of-range levels', () => {
    expect(parseAutonomyApproval(approval({ params: { from: -1, to: 2 } }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: { from: 1, to: 5 } }))).toBeNull();
  });

  it('rejects from >= to (an approval card is only for a raise)', () => {
    expect(parseAutonomyApproval(approval({ params: { from: 2, to: 2 } }))).toBeNull();
    expect(parseAutonomyApproval(approval({ params: { from: 3, to: 1 } }))).toBeNull();
  });

  it('rejects missing id, summary, createdAt, expiresAt', () => {
    for (const k of ['id', 'summary', 'createdAt', 'expiresAt']) {
      expect(parseAutonomyApproval(approval({ [k]: undefined }))).toBeNull();
      expect(parseAutonomyApproval(approval({ [k]: 42 }))).toBeNull();
    }
  });
});

describe('pickPendingAutonomy', () => {
  it('returns null for bad bodies', () => {
    expect(pickPendingAutonomy(null)).toBeNull();
    expect(pickPendingAutonomy('x')).toBeNull();
    expect(pickPendingAutonomy({})).toBeNull();
    expect(pickPendingAutonomy({ approvals: 'nope' })).toBeNull();
    expect(pickPendingAutonomy({ approvals: [] })).toBeNull();
  });

  it('ignores non autonomy_change approvals', () => {
    const body = {
      approvals: [
        approval({ id: 'a', kind: 'tool_call' }),
        approval({ id: 'b', kind: 'ear' }),
      ],
    };
    expect(pickPendingAutonomy(body)).toBeNull();
  });

  it('picks the autonomy_change from a mixed list', () => {
    const body = {
      approvals: [
        approval({ id: 'a', kind: 'tool_call' }),
        approval({ id: 'b' }),
        approval({ id: 'c', kind: 'ear' }),
      ],
    };
    expect(pickPendingAutonomy(body)!.view.id).toBe('b');
  });

  it('skips malformed autonomy entries', () => {
    const body = {
      approvals: [approval({ id: 'bad', params: { from: 1.2, to: 2 } }), approval({ id: 'ok' })],
    };
    expect(pickPendingAutonomy(body)!.view.id).toBe('ok');
  });

  it('picks the newest regardless of order', () => {
    const older = approval({ id: 'old', createdAt: '2026-10-01T00:00:00.000Z' });
    const newer = approval({ id: 'new', createdAt: '2026-10-02T00:00:00.000Z' });
    expect(pickPendingAutonomy({ approvals: [older, newer] })!.view.id).toBe('new');
    expect(pickPendingAutonomy({ approvals: [newer, older] })!.view.id).toBe('new');
  });

  it('excludes expired approvals', () => {
    const expired = approval({ id: 'exp', expiresAt: '2000-01-01T00:00:00.000Z' });
    const live = approval({ id: 'live', createdAt: '2026-09-01T00:00:00.000Z' });
    const picked = pickPendingAutonomy({ approvals: [expired, live] });
    expect(picked?.view.id).toBe('live');
    expect(pickPendingAutonomy({ approvals: [expired] })).toBeNull();
  });
});

describe('interpretPatchResponse', () => {
  it('202 with valid approval -> approval, other settings applied', () => {
    const r = interpretPatchResponse(202, { requiresApproval: true, approval: approval() });
    expect(r.kind).toBe('approval');
    if (r.kind === 'approval') {
      expect(r.othersApplied).toBe(true);
      expect(r.approval.to).toBe(2);
    }
  });

  it('202 with malformed approval -> error, never applied', () => {
    const r = interpretPatchResponse(202, { requiresApproval: true, approval: approval({ kind: 'x' }) });
    expect(r).toEqual({ kind: 'error', message: 'Approval request was malformed' });
    expect(interpretPatchResponse(202, { requiresApproval: true }).kind).toBe('error');
  });

  it('409 with approval -> approval, others not applied', () => {
    const r = interpretPatchResponse(409, { error: 'pending', approval: approval() });
    expect(r.kind).toBe('approval');
    if (r.kind === 'approval') expect(r.othersApplied).toBe(false);
  });

  it('409 without usable approval -> error using server message', () => {
    expect(interpretPatchResponse(409, { error: 'Conflict here' })).toEqual({ kind: 'error', message: 'Conflict here' });
    expect(interpretPatchResponse(409, { error: 'c', approval: approval({ kind: 'ear' }) }).kind).toBe('error');
  });

  it('200 -> applied', () => {
    expect(interpretPatchResponse(200, { ok: true })).toEqual({ kind: 'applied' });
    expect(interpretPatchResponse(200, null)).toEqual({ kind: 'applied' });
  });

  it('400 -> error with server message, or fallback', () => {
    expect(interpretPatchResponse(400, { error: 'Bad level' })).toEqual({ kind: 'error', message: 'Bad level' });
    expect(interpretPatchResponse(400, {})).toEqual({ kind: 'error', message: 'Failed to save' });
    expect(interpretPatchResponse(400, { error: '' })).toEqual({ kind: 'error', message: 'Failed to save' });
    expect(interpretPatchResponse(400, { error: 7 })).toEqual({ kind: 'error', message: 'Failed to save' });
  });

  it('500 -> error', () => {
    expect(interpretPatchResponse(500, { error: 'boom' })).toEqual({ kind: 'error', message: 'boom' });
    expect(interpretPatchResponse(500, undefined)).toEqual({ kind: 'error', message: 'Failed to save' });
  });

  it('401/403 -> error', () => {
    expect(interpretPatchResponse(401, { error: 'Unauthorized' }).kind).toBe('error');
    expect(interpretPatchResponse(403, { error: 'Forbidden origin' }).kind).toBe('error');
  });

  it('non-JSON bodies never produce applied for failure statuses', () => {
    for (const body of [null, undefined, 'Internal Server Error', '<html></html>', 42]) {
      expect(interpretPatchResponse(500, body)).toEqual({ kind: 'error', message: 'Failed to save' });
      expect(interpretPatchResponse(400, body)).toEqual({ kind: 'error', message: 'Failed to save' });
      expect(interpretPatchResponse(409, body)).toEqual({ kind: 'error', message: 'Failed to save' });
    }
  });

  it('202 without requiresApproval flag is not treated as an approval', () => {
    const r = interpretPatchResponse(202, { approval: approval() });
    expect(r.kind).not.toBe('approval');
  });
});

describe('resolveDecision', () => {
  it('EXECUTED moves saved and slider to `to`', () => {
    const r = resolveDecision('EXECUTED', 1, 1, 3);
    expect(r.savedLevel).toBe(3);
    expect(r.sliderLevel).toBe(3);
    expect(r.tone).toBe('success');
    expect(r.message).toContain('3');
  });

  it.each(['DENIED', 'EXPIRED', 'ALREADY_DECIDED', 'FAILED'] as DecisionStatus[])(
    '%s resets slider to saved and leaves saved unchanged',
    (status) => {
      const r = resolveDecision(status, 1, 1, 3);
      expect(r.savedLevel).toBe(1);
      expect(r.sliderLevel).toBe(1);
      expect(r.tone).not.toBe('success');
    },
  );

  it('tones: DENIED/EXPIRED/ALREADY_DECIDED neutral, FAILED error', () => {
    expect(resolveDecision('DENIED', 1, 1, 2).tone).toBe('neutral');
    expect(resolveDecision('EXPIRED', 1, 1, 2).tone).toBe('neutral');
    expect(resolveDecision('ALREADY_DECIDED', 1, 1, 2).tone).toBe('neutral');
    expect(resolveDecision('FAILED', 1, 1, 2).tone).toBe('error');
  });

  it('FAILED includes detail when given', () => {
    expect(resolveDecision('FAILED', 1, 1, 2, 'db down').message).toContain('db down');
    expect(resolveDecision('FAILED', 1, 1, 2, null).message).not.toContain(': ');
  });

  it('unknown status fails safe: saved unchanged, error tone', () => {
    const r = resolveDecision('WAT' as unknown as DecisionStatus, 2, 2, 4);
    expect(r.savedLevel).toBe(2);
    expect(r.sliderLevel).toBe(2);
    expect(r.tone).toBe('error');
  });
});
