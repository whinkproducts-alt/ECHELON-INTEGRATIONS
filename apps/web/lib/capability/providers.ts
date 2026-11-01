/**
 * Provider and grant lifecycle (E4a / E4b). Every function is scoped by userId and every state
 * change is ledgered through lib/ledger.ts. Only the Founder (owner) reaches these from the API.
 *
 * Lifecycle: REGISTERED -> (discover) -> (review) REVIEWED -> (enable) ENABLED <-> DISABLED, and
 * REVOKED which is final. Review is the Founder's decision (D-11) and is only possible after the
 * automated checks pass. Review records a fingerprint of the exact configuration and tool
 * definitions; any later change (endpoint, allow-list, a tool definition) invalidates it.
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { recordAction } from '@/lib/ledger';
import { encryptKey } from '@/lib/key-encryption';
import { canonicalJson } from '@/lib/canonical-json';
import { classifyProtected } from '@/lib/protected-actions';
import { scanText } from '@/lib/secret-scan';
import { validateAllowlistEntry, type EgressDeps } from '@/lib/capability/egress';
import { discoverTools } from '@/lib/capability/mcp-http';
import { DATA_CLASSES, GRANT_DEFAULT_DAYS, GRANT_MAX_DAYS, isDataClass } from '@/lib/capability/policy';
import { resolveAgent, teamExists, agentMayAct } from '@/lib/capability/roster';
import { decryptKey } from '@/lib/key-encryption';
import { isLoopbackUrl } from '@/lib/local-only';
import catalogJson from '@/config/connectors.catalog.json';

export class CapabilityInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'CapabilityInputError';
  }
}

/** Namespaced tool names: no provider can take another provider's tool name. */
export const CAPABILITY_TOOL_PREFIX = 'mcp_';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function providerShortId(connectorRowId: string): string {
  return connectorRowId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-10);
}
export function toolSlug(original: string): string {
  return original.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}
export function namespacedToolName(connectorRowId: string, original: string): string {
  return `${CAPABILITY_TOOL_PREFIX}${providerShortId(connectorRowId)}__${toolSlug(original)}`;
}
export function isCapabilityTool(name: string): boolean {
  return name.startsWith(CAPABILITY_TOOL_PREFIX) && /^mcp_[a-z0-9]{1,10}__[a-z0-9_]{1,40}$/.test(name);
}

interface FingerprintInput {
  endpoint: string | null;
  transport: string | null;
  hostId: string | null;
  maxDataClass: string;
  egressAllowlist: string[];
}
/** What the Founder reviewed: configuration plus the exact tool definitions. */
export function providerFingerprint(c: FingerprintInput, tools: Array<{ originalName: string | null; defHash: string | null; isActive: boolean }>): string {
  const t = tools
    .filter((x) => x.isActive)
    .map((x) => `${x.originalName ?? ''}:${x.defHash ?? ''}`)
    .sort();
  // Only the reviewed fields, named explicitly: spreading a database row would pull in dates and unrelated columns.
  const reviewed = {
    endpoint: c.endpoint, transport: c.transport, hostId: c.hostId, maxDataClass: c.maxDataClass,
    egressAllowlist: [...c.egressAllowlist].sort(), tools: t,
  };
  return createHash('sha256').update(canonicalJson(reviewed)).digest('hex');
}

async function loadFingerprint(userId: string, id: string): Promise<{ row: Awaited<ReturnType<typeof getProvider>>; fp: string }> {
  const row = await getProvider(userId, id);
  const tools = await prisma.tool.findMany({ where: { connectorInstallId: row.id }, select: { originalName: true, defHash: true, isActive: true } });
  return { row, fp: providerFingerprint(row, tools) };
}

export async function getProvider(userId: string, id: string) {
  const row = await prisma.connectorInstall.findFirst({ where: { id, userId, kind: 'MCP_SERVER' } });
  if (!row) throw new CapabilityInputError('Provider not found', 404);
  return row;
}

async function ledger(userId: string, action: string, status: 'EXECUTED' | 'FAILED' | 'DENIED', extra: { connectorInstallId?: string; capabilityId?: string; grantId?: string; hostId?: string; summary?: string; errorCode?: string; correlationId?: string } = {}) {
  await recordAction({
    userId,
    initiator: 'user',
    action,
    permissionClass: 'B',
    status,
    inputSummary: extra.summary,
    connectorInstallId: extra.connectorInstallId,
    capabilityId: extra.capabilityId,
    grantId: extra.grantId,
    hostId: extra.hostId,
    errorCode: extra.errorCode,
    correlationId: extra.correlationId ?? `cap-${randomBytes(6).toString('hex')}`,
  });
}

/** Never returned to a client: credential ciphertext. */
export function publicProvider<T extends { credentialsEnc?: string | null }>(row: T): Omit<T, 'credentialsEnc'> & { hasCredential: boolean } {
  const { credentialsEnc, ...rest } = row;
  return { ...rest, hasCredential: Boolean(credentialsEnc) };
}

// ── Register ────────────────────────────────────────────────────────────────────────────────────

export interface RegisterInput {
  connectorId: string;
  transport: 'streamable-http' | 'stdio';
  endpoint?: string;
  command?: string;
  args?: string[];
  hostId?: string | null;
  credential?: string | null;
  egressAllowlist?: string[];
  maxDataClass?: string;
}

export function validateEndpoint(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new CapabilityInputError('endpoint is not a valid URL'); }
  if (u.username || u.password) throw new CapabilityInputError('endpoint must not contain credentials');
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLoopbackUrl(u.href))) {
    throw new CapabilityInputError('endpoint must use https (http is allowed only for a loopback address)');
  }
  return u;
}

/** Catalog connector ids, read straight from the catalog file (no import of the connector registry). */
export function isCatalogId(id: string): boolean {
  const list = (catalogJson as { connectors?: Array<{ id?: unknown }> }).connectors ?? [];
  return list.some((e) => e.id === id);
}

export async function registerProvider(userId: string, input: RegisterInput) {
  if (!SLUG_RE.test(input.connectorId ?? '')) throw new CapabilityInputError('connectorId must be 1-32 chars of a-z, 0-9 and hyphen');
  if (input.transport !== 'streamable-http' && input.transport !== 'stdio') throw new CapabilityInputError('transport must be streamable-http or stdio');
  const maxDataClass = input.maxDataClass ?? 'organization';
  if (!isDataClass(maxDataClass) || maxDataClass === 'founder_private') throw new CapabilityInputError(`maxDataClass must be one of ${DATA_CLASSES.filter((d) => d !== 'founder_private').join(', ')}`);

  let endpoint: string | null = null;
  let allowlist = (input.egressAllowlist ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  let command: string | null = null;
  let args: string[] = [];

  if (input.transport === 'streamable-http') {
    const u = validateEndpoint(String(input.endpoint ?? ''));
    endpoint = u.href;
    // The provider's own host is the default destination, and nothing else is, unless the Founder lists it.
    const port = u.port || (u.protocol === 'https:' ? '443' : '80');
    const bare = u.hostname.replace(/^\[|\]$/g, '');
    const self = `${bare.includes(':') ? `[${bare}]` : bare}:${port}`; // an IPv6 literal must be bracketed or the port is read as part of the address
    if (allowlist.length === 0) allowlist = [self];
  } else {
    // stdio is stored for a host agent; the web process never spawns it. A host is mandatory.
    if (!input.hostId) throw new CapabilityInputError('stdio providers must be pinned to a host');
    command = String(input.command ?? '');
    if (!/^[A-Za-z0-9_./-]{1,200}$/.test(command)) throw new CapabilityInputError('command must be a plain path without spaces or shell characters');
    args = (input.args ?? []).map(String);
    if (args.length > 32 || args.some((a) => a.length > 500 || /[\0\r\n]/.test(a))) throw new CapabilityInputError('invalid args');
  }
  for (const e of allowlist) {
    const bad = validateAllowlistEntry(e);
    if (bad) throw new CapabilityInputError(`invalid egress allow-list entry "${e.slice(0, 60)}": ${bad}`);
  }
  if (allowlist.length > 50) throw new CapabilityInputError('too many allow-list entries');

  if (input.hostId) {
    const host = await prisma.host.findFirst({ where: { id: input.hostId, userId }, select: { id: true } });
    if (!host) throw new CapabilityInputError('host not found', 404);
  }

  let credentialsEnc: string | null = null;
  let credentialHint: string | null = null;
  if (input.credential) {
    const c = String(input.credential);
    if (c.length > 4096) throw new CapabilityInputError('credential too long');
    credentialsEnc = encryptKey(c); // throws EncryptionNotConfiguredError: there is no fallback key
    credentialHint = c.length >= 16 ? c.slice(-4) : null; // a short secret reveals nothing, not even its tail
  }

  // A provider id may not equal a catalog connector id: both live in one table keyed by (userId, connectorId).
  if (isCatalogId(input.connectorId)) throw new CapabilityInputError('connectorId is reserved by the connector catalog; choose another id', 409);
  const exists = await prisma.connectorInstall.findFirst({ where: { userId, connectorId: input.connectorId }, select: { id: true } });
  if (exists) throw new CapabilityInputError('a connector with this id already exists', 409);

  const row = await prisma.connectorInstall.create({
    data: {
      userId,
      connectorId: input.connectorId,
      kind: 'MCP_SERVER',
      enabled: false,
      transport: input.transport,
      endpoint,
      command,
      args,
      hostId: input.hostId ?? null,
      credentialsEnc,
      credentialHint,
      egressAllowlist: allowlist,
      maxDataClass,
      status: 'REGISTERED',
    },
  });
  await ledger(userId, 'provider_registered', 'EXECUTED', { connectorInstallId: row.id, summary: `connector=${row.connectorId} transport=${row.transport} allowlist=${allowlist.length}` });
  return row;
}

// ── Discover ────────────────────────────────────────────────────────────────────────────────────

export async function discoverProvider(userId: string, id: string, deps: EgressDeps = {}) {
  const prov = await getProvider(userId, id);
  if (prov.status === 'REVOKED') throw new CapabilityInputError('provider is revoked', 409);
  if (prov.transport !== 'streamable-http' || !prov.endpoint) throw new CapabilityInputError('only streamable-http providers can be discovered from this runtime', 409);
  let credential: string | null = null;
  if (prov.credentialsEnc) credential = decryptKey(prov.credentialsEnc);

  const found = await discoverTools({ endpoint: prov.endpoint, egressAllowlist: prov.egressAllowlist, credential }, deps);
  // Reviewed secrets or instructions have no business in a tool definition from a provider.
  const kept = found.tools.filter((t) => scanText('tool', `${t.description}\n${JSON.stringify(t.inputSchema)}`).length === 0);
  const rejected = [...found.rejected, ...found.tools.filter((t) => !kept.includes(t)).map((t) => ({ name: t.originalName, reason: 'definition contains a credential-like string' }))];

  const names = new Map<string, string>();
  for (const t of kept) {
    if (!toolSlug(t.originalName)) { rejected.push({ name: t.originalName, reason: 'name has no usable characters' }); continue; }
    const full = namespacedToolName(prov.id, t.originalName);
    if (names.has(full)) { rejected.push({ name: t.originalName, reason: 'name collides after normalisation' }); continue; }
    names.set(full, t.originalName);
  }

  let created = 0, updated = 0, changed = 0;
  for (const t of kept) {
    if (!toolSlug(t.originalName)) continue;
    const full = namespacedToolName(prov.id, t.originalName);
    if (names.get(full) !== t.originalName) continue;
    const existing = await prisma.tool.findUnique({ where: { name: full } });
    if (existing && existing.connectorInstallId !== prov.id) {
      // Cannot happen with an unguessable id, but if it ever does, never move a tool between providers.
      rejected.push({ name: t.originalName, reason: 'tool name is owned by another provider' });
      continue;
    }
    if (!existing) {
      await prisma.tool.create({
        data: {
          name: full,
          originalName: t.originalName,
          description: t.description,
          capabilities: '[]',
          inputSchema: JSON.stringify(t.inputSchema),
          riskClass: 'C', // strictest until the Founder reviews this exact definition
          costClass: 'UNKNOWN', // paid-or-unknown is blocked until the Founder says FREE
          defHash: t.defHash,
          connectorInstallId: prov.id,
          isActive: true,
        },
      });
      created++;
    } else {
      if (existing.defHash !== t.defHash) changed++;
      await prisma.tool.update({
        where: { id: existing.id },
        data: { description: t.description, inputSchema: JSON.stringify(t.inputSchema), defHash: t.defHash, isActive: true },
      });
      updated++;
    }
  }
  // Tools the provider stopped advertising are switched off, never deleted (their receipts keep a target).
  const live = [...names.keys()];
  const gone = await prisma.tool.updateMany({ where: { connectorInstallId: prov.id, isActive: true, name: { notIn: live } }, data: { isActive: false } });

  await ledger(userId, 'provider_discovered', 'EXECUTED', {
    connectorInstallId: prov.id,
    summary: `created=${created} updated=${updated} definitionChanged=${changed} deactivated=${gone.count} rejected=${rejected.length}`,
  });
  return { created, updated, definitionChanged: changed, deactivated: gone.count, rejected };
}

// ── Automated checks (D-11 prerequisites) and review ─────────────────────────────────────────────

export interface CheckReport {
  pass: boolean;
  failures: string[];
  /** What the Founder is asked to approve, in plain terms. */
  summary: {
    /** What the Founder is looking at. The review must send this back unchanged, or it is refused (409). */
    fingerprint: string;
    endpoint: string | null;
    egressAllowlist: string[];
    maxDataClass: string;
    host: string | null;
    hasCredential: boolean;
    tools: Array<{ id: string; name: string; originalName: string | null; description: string; riskClass: string; costClass: string; protected: boolean; defHash: string | null }>;
  };
}

export async function automatedChecks(userId: string, id: string): Promise<CheckReport> {
  const prov = await getProvider(userId, id);
  const tools = await prisma.tool.findMany({ where: { connectorInstallId: prov.id, isActive: true }, orderBy: { name: 'asc' } });
  const failures: string[] = [];
  if (prov.status === 'REVOKED') failures.push('provider is revoked');
  if (prov.transport !== 'streamable-http') failures.push('only streamable-http providers can be reviewed for invocation in this runtime');
  if (!prov.endpoint) failures.push('no endpoint');
  else { try { validateEndpoint(prov.endpoint); } catch (e) { failures.push((e as Error).message); } }
  if (prov.egressAllowlist.length === 0) failures.push('egress allow-list is empty');
  for (const e of prov.egressAllowlist) { const bad = validateAllowlistEntry(e); if (bad) failures.push(`allow-list entry "${e.slice(0, 40)}": ${bad}`); }
  if (tools.length === 0) failures.push('no tools discovered; run discovery first');
  for (const t of tools) {
    if (!t.defHash) failures.push(`${t.name}: no definition hash`);
    if (scanText('tool', `${t.description}\n${t.inputSchema ?? ''}`).length > 0) failures.push(`${t.name}: definition contains a credential-like string`);
  }
  return {
    pass: failures.length === 0,
    failures,
    summary: {
      fingerprint: providerFingerprint(prov, tools),
      endpoint: prov.endpoint,
      egressAllowlist: prov.egressAllowlist,
      maxDataClass: prov.maxDataClass,
      host: prov.hostId,
      hasCredential: Boolean(prov.credentialsEnc),
      tools: tools.map((t) => ({
        id: t.id,
        name: t.name,
        originalName: t.originalName,
        description: t.description,
        riskClass: t.riskClass,
        costClass: t.costClass,
        protected: classifyProtected({ toolName: t.name, capability: t.name, description: t.description }).protected,
        defHash: t.defHash,
      })),
    },
  };
}

export interface ReviewInput {
  /** The `summary.fingerprint` from the checks the Founder was shown. Required: it pins the review to exactly what was seen. */
  fingerprint?: string;
  /** The Founder's explicit per-tool decision. Tools not listed stay Class C and cost UNKNOWN. */
  tools?: Array<{ toolId: string; riskClass: 'A' | 'B' | 'C'; costClass: 'FREE' | 'METERED' | 'CLOUD_BILLABLE' | 'UNKNOWN' }>;
}

export async function reviewProvider(userId: string, id: string, input: ReviewInput = {}) {
  const report = await automatedChecks(userId, id);
  if (!report.pass) throw new CapabilityInputError(`Automated checks failed: ${report.failures.join('; ')}`, 422);
  // The review is of the exact definitions the Founder was shown, not of whatever is stored now.
  if (typeof input.fingerprint !== 'string' || input.fingerprint !== report.summary.fingerprint) {
    throw new CapabilityInputError('the provider changed since the checks you reviewed (or no fingerprint was sent); reload the checks and review again', 409);
  }
  const prov = await getProvider(userId, id);
  if (prov.status !== 'REGISTERED' && prov.status !== 'DISABLED' && prov.status !== 'REVIEWED' && prov.status !== 'ENABLED') {
    throw new CapabilityInputError(`cannot review a ${prov.status.toLowerCase()} provider`, 409);
  }
  const decisions = new Map((input.tools ?? []).map((d) => [d.toolId, d]));
  for (const t of report.summary.tools) {
    const d = decisions.get(t.id);
    // The default is the strictest setting: Class C and unknown cost.
    let riskClass: 'A' | 'B' | 'C' = d?.riskClass ?? 'C';
    const costClass = d?.costClass ?? 'UNKNOWN';
    if (!['A', 'B', 'C'].includes(riskClass)) throw new CapabilityInputError('invalid riskClass');
    if (!['FREE', 'METERED', 'CLOUD_BILLABLE', 'UNKNOWN'].includes(costClass)) throw new CapabilityInputError('invalid costClass');
    // Protected (money / proprietary egress) tools are Class C, whatever the Founder picks here.
    if (t.protected) riskClass = 'C';
    // Only if the stored definition is still the one that was shown. A concurrent discovery makes this a 409.
    const stamped = await prisma.tool.updateMany({
      where: { id: t.id, connectorInstallId: prov.id, defHash: t.defHash },
      data: { riskClass, costClass, reviewedDefHash: t.defHash },
    });
    if (stamped.count !== 1) throw new CapabilityInputError('a tool definition changed during review; reload the checks and review again', 409);
  }
  // Stamp the fingerprint that was reviewed, not a fresh one: if anything changed meanwhile, enabling is refused.
  const row = await prisma.connectorInstall.update({
    where: { id: prov.id },
    data: { status: 'REVIEWED', reviewedByUserId: userId, reviewedAt: new Date(), reviewedFingerprint: report.summary.fingerprint, disabledReason: null },
  });
  await ledger(userId, 'provider_reviewed', 'EXECUTED', { connectorInstallId: prov.id, summary: `tools=${report.summary.tools.length}` });
  return row;
}

export async function enableProvider(userId: string, id: string) {
  const { row, fp } = await loadFingerprint(userId, id);
  if (row.status === 'REVOKED') throw new CapabilityInputError('provider is revoked', 409);
  if (row.status !== 'REVIEWED' && row.status !== 'DISABLED') throw new CapabilityInputError('provider must be reviewed before it can be enabled', 409);
  if (!row.reviewedFingerprint || row.reviewedFingerprint !== fp) throw new CapabilityInputError('provider changed since its review; review it again', 409);
  const updated = await prisma.connectorInstall.update({ where: { id: row.id }, data: { status: 'ENABLED', enabled: true, disabledReason: null } });
  await ledger(userId, 'provider_enabled', 'EXECUTED', { connectorInstallId: row.id });
  return updated;
}

export async function disableProvider(userId: string, id: string) {
  const row = await getProvider(userId, id);
  if (row.status === 'REVOKED') throw new CapabilityInputError('provider is revoked', 409);
  const updated = await prisma.connectorInstall.update({ where: { id: row.id }, data: { status: 'DISABLED', enabled: false, disabledReason: 'MANUAL' } });
  await ledger(userId, 'provider_disabled', 'EXECUTED', { connectorInstallId: row.id });
  return updated;
}

/** Final. Credentials are destroyed, tools switched off and every grant on them revoked. */
export async function revokeProvider(userId: string, id: string) {
  const row = await getProvider(userId, id);
  const now = new Date();
  const toolIds = (await prisma.tool.findMany({ where: { connectorInstallId: row.id }, select: { id: true } })).map((t) => t.id);
  await prisma.$transaction([
    prisma.connectorInstall.update({ where: { id: row.id }, data: { status: 'REVOKED', enabled: false, credentialsEnc: null, credentialHint: null, disabledReason: 'REVOKED' } }),
    prisma.tool.updateMany({ where: { connectorInstallId: row.id }, data: { isActive: false } }),
    prisma.capabilityGrant.updateMany({ where: { userId, toolId: { in: toolIds }, revokedAt: null }, data: { revokedAt: now } }),
  ]);
  await ledger(userId, 'provider_revoked', 'EXECUTED', { connectorInstallId: row.id, summary: `tools=${toolIds.length}` });
  return prisma.connectorInstall.findFirstOrThrow({ where: { id: row.id, userId } });
}

// ── Grants ──────────────────────────────────────────────────────────────────────────────────────

export interface GrantInput {
  subjectType: 'AGENT' | 'TEAM';
  subjectId: string;
  toolId: string;
  executionPlanId?: string | null;
  scopes?: string[];
  maxInvocations?: number | null;
  days?: number;
}

export async function createGrant(userId: string, input: GrantInput) {
  if (input.subjectType !== 'AGENT' && input.subjectType !== 'TEAM') throw new CapabilityInputError('subjectType must be AGENT or TEAM');
  // Canonical identities only. No free-text ids, no wildcards.
  if (input.subjectType === 'AGENT') {
    const a = await resolveAgent(input.subjectId);
    if (!a) throw new CapabilityInputError('unknown agent: grants go to canonical roster ids only', 404);
    if (!agentMayAct(a.state)) throw new CapabilityInputError(`agent is ${a.state}; it cannot be granted capabilities`, 409);
  } else if (!(await teamExists(input.subjectId))) {
    throw new CapabilityInputError('unknown team: grants go to canonical roster ids only', 404);
  }
  const tool = await prisma.tool.findFirst({ where: { id: input.toolId, isActive: true, connectorInstall: { userId, kind: 'MCP_SERVER' } }, include: { connectorInstall: { select: { id: true, status: true } } } });
  if (!tool) throw new CapabilityInputError('tool not found', 404);
  if (tool.connectorInstall?.status === 'REVOKED') throw new CapabilityInputError('provider is revoked', 409);
  if (input.executionPlanId) {
    const plan = await prisma.executionPlan.findFirst({ where: { id: input.executionPlanId, userId }, select: { id: true } });
    if (!plan) throw new CapabilityInputError('mission (execution plan) not found', 404);
  }
  const days = input.days ?? GRANT_DEFAULT_DAYS;
  if (!Number.isFinite(days) || days <= 0 || days > GRANT_MAX_DAYS) throw new CapabilityInputError(`days must be between 1 and ${GRANT_MAX_DAYS}`);
  if (input.maxInvocations != null && (!Number.isInteger(input.maxInvocations) || input.maxInvocations < 1 || input.maxInvocations > 100_000)) throw new CapabilityInputError('invalid maxInvocations');
  const scopes = (input.scopes ?? []).map(String);
  if (scopes.length > 20 || scopes.some((s) => !/^[a-z0-9:_-]{1,40}$/.test(s))) throw new CapabilityInputError('invalid scopes');

  const grant = await prisma.capabilityGrant.create({
    data: {
      userId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      toolId: tool.id,
      executionPlanId: input.executionPlanId ?? null,
      scopes,
      maxInvocations: input.maxInvocations ?? null,
      expiresAt: new Date(Date.now() + days * 86_400_000),
      grantedByUserId: userId,
    },
  });
  await ledger(userId, 'grant_created', 'EXECUTED', { capabilityId: tool.id, connectorInstallId: tool.connectorInstallId ?? undefined, grantId: grant.id, summary: `${input.subjectType} days=${days}` });
  return grant;
}

export async function revokeGrant(userId: string, grantId: string) {
  const res = await prisma.capabilityGrant.updateMany({ where: { id: grantId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count !== 1) throw new CapabilityInputError('grant not found or already revoked', 404);
  await ledger(userId, 'grant_revoked', 'EXECUTED', { grantId });
}
