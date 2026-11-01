#!/usr/bin/env node
/**
 * ECHELON host heartbeat sender. Run this on the machine that hosts MCP servers (your Mac, or a
 * remote worker) so ECHELON knows the host is alive. No dependencies; Node 20+.
 *
 *   ECHELON_URL=https://your-echelon.example \
 *   ECHELON_HOST_ID=<host id shown in the Integration Hub> \
 *   ECHELON_HOST_TOKEN=<token shown ONCE when you added the host> \
 *   node scripts/host-heartbeat.mjs
 *
 * Optional: ECHELON_HEARTBEAT_SEC (default 30, minimum 5), ECHELON_HEARTBEAT_ONCE=1 (send one and exit).
 *
 * The token authenticates this host only. It is read from the environment, sent as a Bearer header
 * to the URL you configured, and never printed. The Origin header is set to the app's own origin
 * because ECHELON's CSRF rule requires one on every state-changing request.
 * A stopped or sleeping host simply stops sending; ECHELON then treats it as degraded and, after
 * its offline threshold, offline. Nothing here tries to hide an outage.
 */
import os from 'node:os';

const base = (process.env.ECHELON_URL ?? '').replace(/\/+$/, '');
const hostId = process.env.ECHELON_HOST_ID ?? '';
const token = process.env.ECHELON_HOST_TOKEN ?? '';
const every = Math.max(5, Number.parseInt(process.env.ECHELON_HEARTBEAT_SEC ?? '30', 10) || 30);
const once = process.env.ECHELON_HEARTBEAT_ONCE === '1';

if (!base || !/^[A-Za-z0-9]{1,64}$/.test(hostId) || !/^eh_[A-Za-z0-9_-]{20,100}$/.test(token)) {
  console.error('Set ECHELON_URL, ECHELON_HOST_ID and ECHELON_HOST_TOKEN (see the header of this file).');
  process.exit(2);
}
let origin;
try { origin = new URL(base).origin; } catch { console.error('ECHELON_URL is not a valid URL.'); process.exit(2); }
if (new URL(base).protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  console.error('Refusing to send a token over plain http to a non-local address. Use https.');
  process.exit(2);
}

async function beat() {
  try {
    const res = await fetch(`${base}/api/integrations/hosts/${hostId}/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: origin },
      body: JSON.stringify({
        capabilities: {},
        metadata: { platform: process.platform, arch: process.arch, node: process.version, hostname: os.hostname().slice(0, 60), uptimeSec: Math.round(os.uptime()) },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`${new Date().toISOString()} heartbeat ${res.ok ? 'ok' : `refused (${res.status})`}`);
    return res.ok;
  } catch (e) {
    console.error(`${new Date().toISOString()} heartbeat failed: ${e instanceof Error ? e.name : 'error'}`);
    return false;
  }
}

if (once) {
  process.exit((await beat()) ? 0 : 1);
} else {
  await beat();
  setInterval(beat, every * 1000);
}
