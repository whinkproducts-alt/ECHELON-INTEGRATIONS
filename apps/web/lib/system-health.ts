/**
 * System health: facts only. Each probe has a hard timeout, runs in parallel and never throws.
 * Cloud model providers are reported as configured or not; their endpoints are never called.
 * Transports for the gateway and the recall service stay inside their own client modules.
 * Results are cached for 10 s per process.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@/lib/db';
import { configuredCloudModels } from '@/lib/model-router';
import { ollamaReachable } from '@/lib/offline';
import { isGatewayConfigured, listOpenClawTools } from '@/lib/openclaw-client';
import { isAnythingLlmConfigured, listWorkspaces } from '@/lib/anythingllm-client';

export type HealthStatus = 'ok' | 'degraded' | 'down' | 'not_configured' | 'unknown';
export interface Probe { status: HealthStatus; latencyMs?: number; detail?: string; [k: string]: unknown }

export const PROBE_TIMEOUT_MS = 1_500;
export const HEALTH_TTL_MS = 10_000;

const startedAt = Date.now();

class ProbeTimeout extends Error {}

async function timed<T>(fn: () => Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new ProbeTimeout('timeout')), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Run a probe, mapping a throw or a timeout to `down` (or `unknown` when the probe cannot tell). Never throws. */
async function run(fn: () => Promise<Probe>, onFail: HealthStatus = 'down'): Promise<Probe> {
  const t0 = Date.now();
  try {
    const p = await timed(fn);
    return { latencyMs: Date.now() - t0, ...p };
  } catch (e) {
    return { status: onFail, latencyMs: Date.now() - t0, detail: e instanceof ProbeTimeout ? 'timeout' : 'probe failed' };
  }
}

export const probes = {
  async database(): Promise<Probe> {
    return run(async () => { await prisma.$queryRaw`SELECT 1`; return { status: 'ok' }; });
  },

  async modelProviders(): Promise<Probe> {
    return run(async () => {
      const cloud = configuredCloudModels();
      return { status: cloud.length ? 'ok' : 'not_configured', providers: cloud };
    }, 'unknown');
  },

  async localModel(): Promise<Probe> {
    return run(async () => {
      if (!process.env.OLLAMA_URL?.trim()) return { status: 'not_configured' };
      // Only the user's own configured local server is contacted, through the existing cached probe.
      return { status: (await ollamaReachable()) ? 'ok' : 'down' };
    });
  },

  async gateway(): Promise<Probe> {
    return run(async () => {
      if (!isGatewayConfigured()) return { status: 'not_configured' };
      const tools = await listOpenClawTools();
      return { status: 'ok', toolCount: tools.length };
    });
  },

  async recall(): Promise<Probe> {
    return run(async () => {
      if (!isAnythingLlmConfigured()) return { status: 'not_configured' };
      // listWorkspaces swallows transport errors and returns []: an empty list is ambiguous.
      const ws = await listWorkspaces();
      return ws.length ? { status: 'ok' } : { status: 'unknown', detail: 'no workspaces returned (unreachable or empty)' };
    });
  },

  async worker(): Promise<Probe> {
    return run(async () => {
      const found = await prisma.$queryRaw<Array<{ t: string | null }>>`
        SELECT COALESCE(to_regclass('"AgentHeartbeat"')::text, to_regclass('agent_heartbeats')::text) AS t`;
      const table = found[0]?.t?.replace(/"/g, '');
      if (!table) return { status: 'unknown', detail: 'no heartbeat table' };
      const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND (table_name = 'AgentHeartbeat' OR table_name = 'agent_heartbeats')`;
      const names = new Set(cols.map((c) => c.column_name));
      // Fixed statements only: no identifier is built from data.
      let rows: Array<{ last: Date | null }> | null = null;
      if (table === 'AgentHeartbeat') {
        if (names.has('lastSeenAt')) rows = await prisma.$queryRaw`SELECT max("lastSeenAt") AS last FROM "AgentHeartbeat"`;
        else if (names.has('updatedAt')) rows = await prisma.$queryRaw`SELECT max("updatedAt") AS last FROM "AgentHeartbeat"`;
        else if (names.has('createdAt')) rows = await prisma.$queryRaw`SELECT max("createdAt") AS last FROM "AgentHeartbeat"`;
      } else {
        if (names.has('lastSeenAt')) rows = await prisma.$queryRaw`SELECT max("lastSeenAt") AS last FROM agent_heartbeats`;
        else if (names.has('updatedAt')) rows = await prisma.$queryRaw`SELECT max("updatedAt") AS last FROM agent_heartbeats`;
        else if (names.has('createdAt')) rows = await prisma.$queryRaw`SELECT max("createdAt") AS last FROM agent_heartbeats`;
      }
      const last = rows?.[0]?.last;
      if (!last) return { status: 'unknown', detail: 'no heartbeat recorded' };
      const ageSec = Math.max(0, Math.round((Date.now() - new Date(last).getTime()) / 1000));
      return { status: ageSec < 120 ? 'ok' : ageSec < 600 ? 'degraded' : 'down', lastHeartbeatAgeSec: ageSec };
    }, 'unknown');
  },

  async migrations(): Promise<Probe> {
    return run(async () => {
      const r = await prisma.$queryRaw<Array<{ n: bigint | number }>>`
        SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
      const applied = Number(r[0]?.n ?? 0);
      let onDisk: number | null = null;
      try {
        onDisk = readdirSync(join(process.cwd(), 'prisma', 'migrations'), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
      } catch { /* folders not shipped in this deployment */ }
      if (onDisk === null) return { status: 'unknown', applied, detail: 'migration folders not available' };
      return { status: applied >= onDisk ? 'ok' : 'degraded', applied, onDisk, pending: Math.max(0, onDisk - applied) };
    }, 'unknown');
  },
};

export interface OperatorHealth {
  scope: 'operator';
  checkedAt: string;
  uptimeSec: number;
  version: string | null;
  checks: Record<'database' | 'modelProviders' | 'localModel' | 'gateway' | 'recall' | 'worker' | 'migrations', Probe>;
}
export interface UserHealth {
  scope: 'user';
  checkedAt: string;
  checks: { database: Probe };
}

let cache: { at: number; value: OperatorHealth } | null = null;
let userCache: { at: number; value: UserHealth } | null = null;
export function __resetHealthCache(): void { cache = null; userCache = null; }

function version(): string | null {
  const v = process.env.WHINK_VERSION ?? process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return v ? v.slice(0, 40) : null;
}

export async function operatorHealth(now = Date.now()): Promise<OperatorHealth> {
  if (cache && now - cache.at < HEALTH_TTL_MS) return cache.value;
  const [database, modelProviders, localModel, gateway, recall, worker, migrations] = await Promise.all([
    probes.database(), probes.modelProviders(), probes.localModel(), probes.gateway(), probes.recall(), probes.worker(), probes.migrations(),
  ]);
  const value: OperatorHealth = {
    scope: 'operator',
    checkedAt: new Date(now).toISOString(),
    uptimeSec: Math.round((now - startedAt) / 1000),
    version: version(),
    checks: { database, modelProviders, localModel, gateway, recall, worker, migrations },
  };
  cache = { at: now, value };
  return value;
}

/** Non-owners see only whether the service answers: no latency detail, no operator configuration. */
export async function userHealth(now = Date.now()): Promise<UserHealth> {
  if (userCache && now - userCache.at < HEALTH_TTL_MS) return userCache.value;
  const db = await probes.database();
  const value: UserHealth = { scope: 'user', checkedAt: new Date(now).toISOString(), checks: { database: { status: db.status } } };
  userCache = { at: now, value };
  return value;
}
