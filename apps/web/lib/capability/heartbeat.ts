/**
 * Host liveness (E4a-09). A host is ONLINE, DEGRADED or OFFLINE depending on how long ago it last
 * sent a heartbeat. The state is a PURE FUNCTION of (lastHeartbeat, now, config). The invocation
 * gate evaluates it at decision time, so nothing has to "re-enable" providers when a host comes
 * back: the next heartbeat makes the next decision ALLOW again, and a manual Founder disable is
 * never reversed by a reconnect.
 *
 * Thresholds must leave room for jitter: degraded is at least 2 x the interval and offline at
 * least 1.5 x degraded. With the defaults (30 / 75 / 120 s) a host that beats every 30 s never
 * flaps, and a laptop that sleeps for a minute is DEGRADED, not OFFLINE.
 */
export type HostStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface HeartbeatConfig {
  intervalSec: number;
  degradedAfterSec: number;
  offlineAfterSec: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = { intervalSec: 30, degradedAfterSec: 75, offlineAfterSec: 120 };

function positiveInt(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 && String(n) === v.trim() ? n : null;
}

/** Read thresholds from the environment, then enforce the ordering rules. Never throws. */
export function loadHeartbeatConfig(env: Record<string, string | undefined> = process.env): HeartbeatConfig {
  const d = DEFAULT_HEARTBEAT_CONFIG;
  const interval = positiveInt(env.HEARTBEAT_INTERVAL_SEC) ?? d.intervalSec;
  const degradedWanted = positiveInt(env.HEARTBEAT_DEGRADED_AFTER_SEC) ?? d.degradedAfterSec;
  const offlineWanted = positiveInt(env.HEARTBEAT_OFFLINE_AFTER_SEC) ?? d.offlineAfterSec;
  const degraded = Math.max(degradedWanted, interval * 2);
  const offline = Math.max(offlineWanted, Math.ceil(degraded * 1.5));
  return { intervalSec: interval, degradedAfterSec: degraded, offlineAfterSec: offline };
}

/** A host that has never sent a heartbeat is OFFLINE, never ONLINE. */
export function evaluateHostStatus(lastHeartbeat: Date | null | undefined, now: Date, cfg: HeartbeatConfig = DEFAULT_HEARTBEAT_CONFIG): HostStatus {
  if (!lastHeartbeat) return 'OFFLINE';
  const elapsed = (now.getTime() - lastHeartbeat.getTime()) / 1000;
  if (elapsed < 0) return 'ONLINE'; // small clock skew in the host's favour is not an outage
  if (elapsed >= cfg.offlineAfterSec) return 'OFFLINE';
  if (elapsed >= cfg.degradedAfterSec) return 'DEGRADED';
  return 'ONLINE';
}
