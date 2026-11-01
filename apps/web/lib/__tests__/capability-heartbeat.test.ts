import { describe, expect, it } from 'vitest';
import { DEFAULT_HEARTBEAT_CONFIG, evaluateHostStatus, loadHeartbeatConfig } from '@/lib/capability/heartbeat';

const t = (s: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, s));

describe('evaluateHostStatus', () => {
  it('a host that never sent a heartbeat is OFFLINE, never ONLINE', () => {
    expect(evaluateHostStatus(null, t(0))).toBe('OFFLINE');
    expect(evaluateHostStatus(undefined, t(0))).toBe('OFFLINE');
  });
  it('walks ONLINE -> DEGRADED -> OFFLINE and back to ONLINE on the next heartbeat', () => {
    expect(evaluateHostStatus(t(0), t(74))).toBe('ONLINE');
    expect(evaluateHostStatus(t(0), t(75))).toBe('DEGRADED');
    expect(evaluateHostStatus(t(0), t(120))).toBe('OFFLINE');
    expect(evaluateHostStatus(t(130), t(131))).toBe('ONLINE'); // recovery needs no sweeper and no re-enable step
  });
  it('a host beating exactly on its interval never flaps (the original defaults did)', () => {
    const c = DEFAULT_HEARTBEAT_CONFIG;
    for (let k = 1; k <= 20; k++) expect(evaluateHostStatus(t(0), t(c.intervalSec * k % c.degradedAfterSec), c)).toBe('ONLINE');
    expect(evaluateHostStatus(t(0), t(c.intervalSec), c)).toBe('ONLINE');
    expect(evaluateHostStatus(t(0), t(c.intervalSec * 2), c)).toBe('ONLINE');
  });
  it('tolerates small clock skew in the host\'s favour', () => {
    expect(evaluateHostStatus(t(10), t(5))).toBe('ONLINE');
  });
});

describe('loadHeartbeatConfig', () => {
  it('uses the defaults', () => expect(loadHeartbeatConfig({})).toEqual(DEFAULT_HEARTBEAT_CONFIG));
  it('cannot be configured into flapping: degraded >= 2x interval, offline >= 1.5x degraded', () => {
    const c = loadHeartbeatConfig({ HEARTBEAT_INTERVAL_SEC: '30', HEARTBEAT_DEGRADED_AFTER_SEC: '30', HEARTBEAT_OFFLINE_AFTER_SEC: '60' });
    expect(c.degradedAfterSec).toBeGreaterThanOrEqual(60);
    expect(c.offlineAfterSec).toBeGreaterThanOrEqual(Math.ceil(c.degradedAfterSec * 1.5));
  });
  it('ignores junk values', () => {
    expect(loadHeartbeatConfig({ HEARTBEAT_INTERVAL_SEC: 'abc', HEARTBEAT_DEGRADED_AFTER_SEC: '-5', HEARTBEAT_OFFLINE_AFTER_SEC: '1e9' })).toEqual(DEFAULT_HEARTBEAT_CONFIG);
  });
});
