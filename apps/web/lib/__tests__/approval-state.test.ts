import { describe, it, expect } from 'vitest';
import {
  approvalReducer, initialCardState, secondsRemaining, shortResult, normalizeApproval, mostRecent,
  type CardState, type DecisionResponse,
} from '@/lib/hooks/approval-state';

const resp = (status: DecisionResponse['status'], result: DecisionResponse['result'] = null): DecisionResponse =>
  ({ id: 'a', status, result });

describe('secondsRemaining', () => {
  it('rounds up and clamps at 0', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(secondsRemaining('2026-01-01T00:00:30Z', now)).toBe(30);
    expect(secondsRemaining('2026-01-01T00:00:29.100Z', now)).toBe(30);
    expect(secondsRemaining('2026-01-01T00:00:00Z', now)).toBe(0);
    expect(secondsRemaining('2025-12-31T23:59:00Z', now)).toBe(0);
  });
  it('treats invalid dates as expired', () => {
    expect(secondsRemaining('nope', 0)).toBe(0);
  });
});

describe('approvalReducer', () => {
  it('submit moves pending to submitting once', () => {
    const s = approvalReducer(initialCardState, { type: 'submit' });
    expect(s.phase).toBe('submitting');
    expect(approvalReducer(s, { type: 'submit' })).toBe(s);
  });
  it('maps every status', () => {
    const sub: CardState = { ...initialCardState, phase: 'submitting' };
    expect(approvalReducer(sub, { type: 'response', response: resp('EXECUTED', { success: true, data: 'ok' }) }))
      .toMatchObject({ phase: 'executed', detail: 'ok' });
    expect(approvalReducer(sub, { type: 'response', response: resp('DENIED') }).phase).toBe('denied');
    expect(approvalReducer(sub, { type: 'response', response: resp('EXPIRED') }).phase).toBe('expired');
    expect(approvalReducer(sub, { type: 'response', response: resp('ALREADY_DECIDED') }).phase).toBe('already_decided');
    expect(approvalReducer(sub, { type: 'response', response: resp('FAILED', { success: false, error: 'boom' }) }))
      .toMatchObject({ phase: 'failed', detail: 'boom' });
  });
  it('ignores changes after a final state', () => {
    const done = approvalReducer(initialCardState, { type: 'response', response: resp('DENIED') });
    expect(approvalReducer(done, { type: 'response', response: resp('EXECUTED') })).toBe(done);
    expect(approvalReducer(done, { type: 'tick', secondsLeft: 0 })).toBe(done);
  });
  it('tick at 0 expires only a pending card', () => {
    expect(approvalReducer(initialCardState, { type: 'tick', secondsLeft: 5 })).toBe(initialCardState);
    expect(approvalReducer(initialCardState, { type: 'tick', secondsLeft: 0 }).phase).toBe('expired');
    const sub: CardState = { ...initialCardState, phase: 'submitting' };
    expect(approvalReducer(sub, { type: 'tick', secondsLeft: 0 })).toBe(sub);
  });
  it('network failure returns to pending with an error', () => {
    const sub: CardState = { ...initialCardState, phase: 'submitting' };
    expect(approvalReducer(sub, { type: 'request_failed', message: 'x' }))
      .toMatchObject({ phase: 'pending', requestError: 'x' });
  });
});

describe('helpers', () => {
  it('shortResult truncates', () => {
    expect(shortResult({ success: true, data: 'x'.repeat(500) }, 10)).toBe('xxxxxxxxxx…');
    expect(shortResult(null)).toBeNull();
  });
  it('normalizeApproval rejects junk and fills defaults', () => {
    expect(normalizeApproval({ id: 1 })).toBeNull();
    const a = normalizeApproval({ id: 'a', kind: 'ear', summary: 's', createdAt: 'c', expiresAt: 'e' });
    expect(a).toMatchObject({ tool: null, params: null, permissionClass: 'C' });
  });
  it('mostRecent picks latest createdAt', () => {
    const mk = (id: string, createdAt: string) =>
      normalizeApproval({ id, kind: 'ear', summary: '', createdAt, expiresAt: createdAt })!;
    expect(mostRecent([mk('a', '2026-01-01T00:00:00Z'), mk('b', '2026-01-01T00:00:05Z')])?.id).toBe('b');
    expect(mostRecent([])).toBeNull();
  });
});
