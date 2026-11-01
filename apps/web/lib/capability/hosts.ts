/**
 * Hosts (E4a-09): the machines that run MCP servers (the Mac, a remote worker).
 *
 * A host proves itself with a token that is shown ONCE when the host is created and stored only as a
 * sha256 hash. Each host has its own token (a leaked token impersonates one host, not all of them).
 * Liveness is derived from lastHeartbeat (lib/capability/heartbeat.ts); the stored `status` column is
 * only a display cache, refreshed by sweepHosts, and the invocation gate never relies on it.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { evaluateHostStatus, loadHeartbeatConfig, type HostStatus } from '@/lib/capability/heartbeat';
import { CapabilityInputError } from '@/lib/capability/providers';

export const MAX_HOST_JSON_BYTES = 4096;

export function newHostToken(): string {
  return `eh_${randomBytes(32).toString('base64url')}`;
}
export function hashHostToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashHostToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicHost<T extends { tokenHash?: string }>(h: T): Omit<T, 'tokenHash'> {
  const { tokenHash: _omit, ...rest } = h;
  void _omit;
  return rest;
}

export async function createHost(userId: string, input: { name: string; kind?: 'LOCAL' | 'REMOTE' }) {
  const name = String(input.name ?? '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,39}$/.test(name)) throw new CapabilityInputError('host name must be 1-40 characters: letters, digits, space, _ . -');
  const kind = input.kind ?? 'REMOTE';
  if (kind !== 'LOCAL' && kind !== 'REMOTE') throw new CapabilityInputError('kind must be LOCAL or REMOTE');
  if (await prisma.host.findFirst({ where: { userId, name }, select: { id: true } })) throw new CapabilityInputError('a host with this name already exists', 409);
  const token = newHostToken();
  const host = await prisma.host.create({ data: { userId, name, kind, status: 'OFFLINE', tokenHash: hashHostToken(token) } });
  await recordAction({ userId, initiator: 'user', action: 'host_registered', permissionClass: 'B', status: 'EXECUTED', hostId: host.id, inputSummary: `name=${name} kind=${kind}`, correlationId: `host-${host.id}` });
  return { host: publicHost(host), token }; // the token is returned this once and never again
}

export async function rotateHostToken(userId: string, hostId: string) {
  const token = newHostToken();
  const res = await prisma.host.updateMany({ where: { id: hostId, userId }, data: { tokenHash: hashHostToken(token) } });
  if (res.count !== 1) throw new CapabilityInputError('host not found', 404);
  await recordAction({ userId, initiator: 'user', action: 'host_token_rotated', permissionClass: 'B', status: 'EXECUTED', hostId, correlationId: `host-${hostId}` });
  return { token };
}

function boundedObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const s = JSON.stringify(v);
  if (s.length > MAX_HOST_JSON_BYTES) throw new CapabilityInputError('capabilities / metadata too large');
  return JSON.parse(s) as Record<string, unknown>;
}

export type HeartbeatOutcome = { ok: true; status: HostStatus; receivedAt: string } | { ok: false };

/** Token-authenticated. Unknown host and wrong token are indistinguishable to the caller. */
export async function recordHeartbeat(hostId: string, token: string, body: { capabilities?: unknown; metadata?: unknown }, now: Date = new Date()): Promise<HeartbeatOutcome> {
  if (!hostId || !token) return { ok: false };
  const host = await prisma.host.findUnique({ where: { id: hostId } });
  if (!host || !tokenMatches(token, host.tokenHash)) return { ok: false };
  const cfg = loadHeartbeatConfig();
  const before = evaluateHostStatus(host.lastHeartbeat, now, cfg);
  await prisma.host.update({
    where: { id: host.id },
    data: { lastHeartbeat: now, status: 'ONLINE', capabilities: boundedObject(body.capabilities) as object, metadata: boundedObject(body.metadata) as object },
  });
  if (before !== 'ONLINE') {
    await recordAction({ userId: host.userId, initiator: 'system', action: 'host_online', permissionClass: 'A', status: 'EXECUTED', hostId: host.id, inputSummary: `was ${before}`, correlationId: `host-${host.id}` });
  }
  return { ok: true, status: 'ONLINE', receivedAt: now.toISOString() };
}

export interface HostView {
  id: string; name: string; kind: string; status: HostStatus; lastHeartbeat: Date | null; capabilities: unknown; metadata: unknown;
}

/** Live status computed now, whatever the cached column says. */
export async function listHosts(userId: string, now: Date = new Date()): Promise<HostView[]> {
  const cfg = loadHeartbeatConfig();
  const rows = await prisma.host.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  return rows.map((h) => ({ id: h.id, name: h.name, kind: h.kind, status: evaluateHostStatus(h.lastHeartbeat, now, cfg), lastHeartbeat: h.lastHeartbeat, capabilities: h.capabilities, metadata: h.metadata }));
}

/**
 * Materialise the display cache and ledger each transition once. Safe to run concurrently: the
 * update is a compare-and-set on the old status, so only one runner records a given transition.
 * It changes NO provider state: a manual disable is never undone by a host returning.
 */
export async function sweepHosts(userId?: string, now: Date = new Date()): Promise<Array<{ hostId: string; from: string; to: HostStatus }>> {
  const cfg = loadHeartbeatConfig();
  const hosts = await prisma.host.findMany({ where: userId ? { userId } : {} });
  const out: Array<{ hostId: string; from: string; to: HostStatus }> = [];
  for (const h of hosts) {
    const live = evaluateHostStatus(h.lastHeartbeat, now, cfg);
    if (live === h.status) continue;
    const won = await prisma.host.updateMany({ where: { id: h.id, status: h.status }, data: { status: live } });
    if (won.count !== 1) continue;
    await recordAction({
      userId: h.userId, initiator: 'system', action: `host_${live.toLowerCase()}`, permissionClass: 'A',
      status: 'EXECUTED', hostId: h.id, inputSummary: `was ${h.status}`, correlationId: `host-${h.id}`,
    });
    out.push({ hostId: h.id, from: h.status, to: live });
  }
  return out;
}
