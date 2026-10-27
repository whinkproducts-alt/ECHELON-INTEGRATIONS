import { describe, expect, it } from 'vitest';
import { assessLateApproval } from '../approval-council';

describe('late-approval council', () => {
  it('requires a unanimous five-person council for an explicit read-only tool', () => {
    const result = assessLateApproval({ id: 'a-read-1', kind: 'tool_call', tool: 'memory_read', params: { query: 'x' } });
    expect(result.eligible).toBe(true);
    expect(result.members).toHaveLength(5);
    expect(result.members.slice(0, 2)).toEqual(['WHINK', 'MAMBA']);
    expect(result.votes).toHaveLength(5);
    expect(result.votes.every((vote) => vote.approve)).toBe(true);
  });

  it('keeps writes, gateway calls, and communications founder-approved', () => {
    for (const row of [
      { id: 'a-write-1', kind: 'tool_call', tool: 'memory_write' },
      { id: 'a-gateway-1', kind: 'tool_call', tool: 'openclaw__calendar__list' },
      { id: 'a-email-1', kind: 'tool_call', tool: 'email_send' },
    ]) {
      const result = assessLateApproval(row);
      expect(result.eligible).toBe(false);
      expect(result.votes.every((vote) => !vote.approve)).toBe(true);
    }
  });

  it('selects reproducible directors for the audit trail', () => {
    const first = assessLateApproval({ id: 'stable-id', kind: 'tool_call', tool: 'document_search' });
    const second = assessLateApproval({ id: 'stable-id', kind: 'tool_call', tool: 'document_search' });
    expect(first.members).toEqual(second.members);
  });
});

