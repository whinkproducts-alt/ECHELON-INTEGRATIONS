/**
 * Capability policy: the single decision point for "may this subject call this tool now?".
 *
 * Pure: it receives already-loaded records and returns a decision. The loader and the side effects
 * (ledger, approval, execution) live in invoke.ts. Deny by default: the first failing gate denies,
 * and reaching the end is the only way to ALLOW.
 *
 * What this module does NOT decide: the permission class (A/B/C), protected money / proprietary
 * actions and approvals. Those belong to lib/permission-engine.ts and are applied by invoke.ts
 * after these gates, so there is one engine for permissions and no second copy to drift.
 */
import { evaluateHostStatus, type HeartbeatConfig, DEFAULT_HEARTBEAT_CONFIG } from '@/lib/capability/heartbeat';
import { hostAllowed, scanForUrls } from '@/lib/capability/egress';
import { SECRET_RULES } from '@/lib/secret-scan';

export type CapabilityErrorCode =
  | 'AUTH_INVALID_SESSION' // provider revoked
  | 'AUTHZ_POLICY_DENIED'
  | 'RES_NOT_FOUND'
  | 'RES_PROVIDER_DISABLED'
  | 'RES_HOST_UNAVAILABLE'
  | 'BLOCKED_COST'
  | 'DATA_CLASS_DENIED'
  | 'EGRESS_DENIED'
  | 'VAL_INPUT_INVALID'
  | 'VAL_SCHEMA_INVALID'
  | 'APPROVAL_REQUIRED'
  | 'EXEC_FAILED'
  | 'EXEC_TIMEOUT';

export const DATA_CLASSES = ['public', 'organization', 'confidential', 'founder_private'] as const;
export type DataClass = (typeof DATA_CLASSES)[number];
const RANK: Record<DataClass, number> = { public: 0, organization: 1, confidential: 2, founder_private: 3 };
export function isDataClass(v: unknown): v is DataClass {
  return typeof v === 'string' && (DATA_CLASSES as readonly string[]).includes(v);
}

/** Longest a grant may live. Standing, open-ended grants do not exist. */
export const GRANT_MAX_DAYS = 30;
export const GRANT_DEFAULT_DAYS = 7;
export const MAX_ARGS_BYTES = 128 * 1024;

export type Subject =
  | { type: 'AGENT'; agentId: string; teamId?: string | null }
  | { type: 'OWNER' }; // the Founder testing a tool from the Integration Hub

export interface PolicyTool {
  id: string;
  name: string;
  isActive: boolean;
  costClass: string;
  riskClass: string;
  defHash: string | null;
  reviewedDefHash: string | null;
  connectorInstallId: string | null;
}

export interface PolicyConnector {
  id: string;
  userId: string;
  kind: string;
  status: string;
  transport: string | null;
  endpoint: string | null;
  hostId: string | null;
  egressAllowlist: string[];
  maxDataClass: string;
  reviewedFingerprint: string | null;
}

export interface PolicyHost {
  id: string;
  lastHeartbeat: Date | null;
}

export interface PolicyGrant {
  id: string;
  userId: string;
  subjectType: string;
  subjectId: string;
  toolId: string;
  executionPlanId: string | null;
  scopes: string[];
  maxInvocations: number | null;
  invocationCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface PolicyInput {
  userId: string;
  subject: Subject;
  tool: PolicyTool | null;
  connector: PolicyConnector | null;
  host: PolicyHost | null;
  /** All grants that could apply to this tool for this owner (the gate picks the one that fits). */
  grants: PolicyGrant[];
  /** Current fingerprint of the provider (endpoint, allow-list, tool definitions). */
  currentFingerprint: string | null;
  args: Record<string, unknown>;
  dataClass: DataClass;
  missionId?: string | null;
  requestedScopes?: string[];
  now: Date;
  heartbeat?: HeartbeatConfig;
}

export type PolicyDecision =
  | { effect: 'ALLOW'; grant: PolicyGrant | null; reason: string }
  | { effect: 'DENY'; code: CapabilityErrorCode; reason: string };

const deny = (code: CapabilityErrorCode, reason: string): PolicyDecision => ({ effect: 'DENY', code, reason });

/** Effective permission class of a provider tool: the reviewed class only while the definition is the reviewed one. */
export function effectiveToolClass(tool: Pick<PolicyTool, 'riskClass' | 'defHash' | 'reviewedDefHash'>): 'A' | 'B' | 'C' {
  const reviewed = Boolean(tool.defHash) && tool.defHash === tool.reviewedDefHash;
  if (!reviewed) return 'C';
  return tool.riskClass === 'A' || tool.riskClass === 'B' ? tool.riskClass : 'C';
}

export function evaluateGates(p: PolicyInput): PolicyDecision {
  const { tool, connector } = p;

  // 1. The tool exists, is active, and belongs to a provider owned by the same account.
  if (!tool || !connector) return deny('RES_NOT_FOUND', 'unknown tool');
  if (connector.userId !== p.userId || connector.kind !== 'MCP_SERVER' || tool.connectorInstallId !== connector.id) {
    return deny('RES_NOT_FOUND', 'unknown tool');
  }

  // 2. Provider state first, so a revoked provider always reports as revoked (revoking also switches its tools off).
  if (connector.status === 'REVOKED') return deny('AUTH_INVALID_SESSION', 'provider is revoked');
  if (!tool.isActive) return deny('RES_PROVIDER_DISABLED', 'tool is not active');
  if (connector.status !== 'ENABLED') return deny('RES_PROVIDER_DISABLED', `provider is ${connector.status.toLowerCase()}`);
  // The Founder reviewed one exact configuration. Any change since then needs a new review.
  if (!connector.reviewedFingerprint || connector.reviewedFingerprint !== p.currentFingerprint) {
    return deny('RES_PROVIDER_DISABLED', 'provider changed since it was reviewed; review it again');
  }

  // 3. Transport this runtime can actually execute. stdio runs on a host agent, never in the web process.
  if (connector.transport !== 'streamable-http') {
    return deny('RES_PROVIDER_DISABLED', 'only streamable-http providers can be invoked from this runtime');
  }
  if (!connector.endpoint) return deny('RES_PROVIDER_DISABLED', 'provider has no endpoint');

  // 4. Host liveness, computed now from the last heartbeat.
  if (connector.hostId) {
    if (!p.host || p.host.id !== connector.hostId) return deny('RES_HOST_UNAVAILABLE', 'host is unknown');
    if (evaluateHostStatus(p.host.lastHeartbeat, p.now, p.heartbeat ?? DEFAULT_HEARTBEAT_CONFIG) !== 'ONLINE') {
      return deny('RES_HOST_UNAVAILABLE', 'host is not online');
    }
  }

  // 5. Data class: sealed Founder data never leaves; anything else must fit the provider's ceiling.
  if (p.dataClass === 'founder_private') return deny('DATA_CLASS_DENIED', 'founder-private data cannot be sent to a provider');
  const ceiling = (connector.maxDataClass in RANK ? connector.maxDataClass : 'public') as DataClass;
  if (RANK[p.dataClass] > RANK[ceiling]) return deny('DATA_CLASS_DENIED', `data class ${p.dataClass} exceeds the provider ceiling (${ceiling})`);
  // The label is a claim by the caller, so the content is also checked: credentials and sealed markers are refused.
  const serialised = safeJson(p.args);
  if (serialised === null) return deny('VAL_INPUT_INVALID', 'arguments are not serialisable');
  if (/founder[_ -]?private/i.test(serialised) || /"__marker"\s*:\s*"[^"]*private/i.test(serialised)) {
    return deny('DATA_CLASS_DENIED', 'arguments carry a founder-private marker');
  }
  // SECRET_RULES directly, not scanText: scanText skips lines over 2,000 chars, which a long blob would use to hide a key.
  if (serialised.length > MAX_ARGS_BYTES) return deny('VAL_INPUT_INVALID', `arguments exceed ${MAX_ARGS_BYTES} bytes`);
  if (SECRET_RULES.some((r) => r.re.test(serialised))) return deny('DATA_CLASS_DENIED', 'arguments appear to contain a credential');

  // 6. Egress: every URL in the arguments must be on the provider's allow-list. Incomplete scan = deny.
  const scan = scanForUrls(p.args);
  if (scan.incomplete) return deny('EGRESS_DENIED', 'arguments too deep or malformed to verify');
  for (const u of scan.urls) {
    if (!hostAllowed(u, connector.egressAllowlist)) return deny('EGRESS_DENIED', `argument URL host not on the allow-list: ${u.hostname}`);
  }

  // 7. Cost: only tools the Founder marked FREE run. Unknown, metered and cloud-billable are blocked.
  if (tool.costClass !== 'FREE') return deny('BLOCKED_COST', `tool cost class is ${tool.costClass}; paid or unknown cost is not authorised`);

  // 8. Grant. The Founder testing a tool from the Hub is the only subject that needs none.
  if (p.subject.type === 'OWNER') return { effect: 'ALLOW', grant: null, reason: 'owner test' };
  const subject = p.subject;
  const requested = p.requestedScopes ?? [];
  const candidates = p.grants.filter((g) => {
    if (g.userId !== p.userId || g.toolId !== tool.id) return false;
    if (g.revokedAt) return false;
    if (g.expiresAt.getTime() <= p.now.getTime()) return false;
    if (g.maxInvocations !== null && g.invocationCount >= g.maxInvocations) return false;
    const subjectMatches =
      (g.subjectType === 'AGENT' && g.subjectId === subject.agentId) ||
      (g.subjectType === 'TEAM' && !!subject.teamId && g.subjectId === subject.teamId);
    if (!subjectMatches) return false;
    if (g.executionPlanId && g.executionPlanId !== (p.missionId ?? null)) return false;
    if (requested.some((s) => !g.scopes.includes(s))) return false;
    return true;
  });
  if (candidates.length === 0) return deny('AUTHZ_POLICY_DENIED', 'no valid grant for this subject, tool and mission');
  // Prefer the narrowest grant (mission-scoped, then agent-specific).
  candidates.sort((a, b) => Number(Boolean(b.executionPlanId)) - Number(Boolean(a.executionPlanId)) || Number(b.subjectType === 'AGENT') - Number(a.subjectType === 'AGENT'));
  return { effect: 'ALLOW', grant: candidates[0], reason: 'all gates passed' };
}

function safeJson(v: unknown): string | null {
  try { return JSON.stringify(v) ?? null; } catch { return null; }
}
