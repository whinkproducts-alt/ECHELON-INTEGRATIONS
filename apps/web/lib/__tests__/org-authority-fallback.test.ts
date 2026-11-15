import { describe, expect, it } from 'vitest';
import { _clearTierCache, mapSubjectToTier } from '@/lib/settings/org-authority';
describe('unregistered authority', () => {
  it('keeps unregistered subjects at the lowest tier', async () => {
    _clearTierCache();
    expect(await mapSubjectToTier({ type: 'AGENT', agentId: 'unregistered' }, 'owner')).toBe('agent');
  });
});
