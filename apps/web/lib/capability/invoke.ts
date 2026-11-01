/**
 * invokeCapability: the one way an agent (or the Founder, testing) calls a registered provider tool.
 *
 * Order, deny by default, every outcome ledgered through lib/ledger.ts:
 *   1. load the tool, provider, host and grants (all scoped by userId);
 *   2. policy gates (lib/capability/policy.ts): provider state, review fingerprint, host liveness,
 *      data class, egress, cost, grant bound to subject + tool + mission;
 *   3. the existing permission engine (lib/permission-engine.ts): protected money / proprietary
 *      actions, Class A / B / C, delegations. Not allowed => an approval request is created and
 *      NOTHING runs. The Founder approves by request id; lib/approvals.ts then calls
 *      executeApprovedCapability, which re-runs every gate and checks the hash-locked approval;
 *   4. atomic grant reservation (invocation cap), then a write-ahead ledger row;
 *   5. one call over the egress-pinned MCP client; the ledger row is closed with the outcome.
 *
 * The ledger never stores arguments or results, only their key names (credential-like keys are replaced
 * with "[redacted]"), size and sha256, so a receipt cannot leak what it describes. Results are returned as
 * untrusted text. One exception, by design of the approval flow: when a call is executed after a Founder
 * approval, approval_requests.result keeps a truncated copy (4000 characters) like every other approved tool.
 */
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordAction, updateActionStatus, type LedgerEntry } from '@/lib/ledger';
import { checkApprovedAction, checkPermission } from '@/lib/permission-engine';
import { createApproval } from '@/lib/approvals';
import { decryptKey } from '@/lib/key-encryption';
import { approvalContentHash } from '@/lib/canonical-json';
import { classifyProtected } from '@/lib/protected-actions';
import { SECRET_RULES } from '@/lib/secret-scan';
import { callProviderTool, ProviderError, type ProviderConn } from '@/lib/capability/mcp-http';
import { evaluateGates, effectiveToolClass, isDataClass, type CapabilityErrorCode, type DataClass } from '@/lib/capability/policy';
import { loadHeartbeatConfig } from '@/lib/capability/heartbeat';
import { providerFingerprint } from '@/lib/capability/providers';
import { agentMayAct, resolveAgent } from '@/lib/capability/roster';
import type { EgressDeps } from '@/lib/capability/egress';

export class CapabilityError extends Error {
  constructor(readonly code: CapabilityErrorCode, message: string, readonly actionId?: string) {
    super(message);
    this.name = 'CapabilityError';
  }
}

export type InvokeSubject = { type: 'AGENT'; agentId: string } | { type: 'OWNER' };

export interface InvokeParams {
  userId: string;
  subject: InvokeSubject;
  toolName: string;
  args: Record<string, unknown>;
  /** Required. What the arguments contain. The caller cannot omit it. */
  dataClass: DataClass;
  missionId?: string | null;
  requestedScopes?: string[];
  correlationId?: string;
  persona?: string;
}

export type InvokeResult =
  | { status: 'EXECUTED'; output: string; actionId: string; untrusted: true }
  | { status: 'AWAITING_APPROVAL'; approvalId: string; actionId: string; reason: string };

interface ApprovedContext {
  approvalId: string;
  contentHash: string;
  defHash: string;
}

export interface InvokeDeps extends EgressDeps {
  now?: () => Date;
}

const MAX_TIMEOUT_MS = 120_000;

function summarise(v: unknown): string {
  let json = '';
  try { json = JSON.stringify(v) ?? ''; } catch { json = ''; }
  // Key names are recorded, but a key that is itself a credential-like string is not.
  const keys = (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as object).slice(0, 20) : [])
    .map((k) => (k.length > 80 || SECRET_RULES.some((r) => r.re.test(k)) ? '[redacted]' : k));
  return JSON.stringify({ keys, bytes: json.length, sha256: createHash('sha256').update(json).digest('hex') });
}

/** The exact approved payload. This, hashed, is what the Founder's approval is locked to. */
export interface ApprovedParams {
  args: Record<string, unknown>;
  defHash: string;
  dataClass: DataClass;
  missionId: string | null;
  requestedScopes: string[];
  subject: InvokeSubject;
}

export async function invokeCapability(p: InvokeParams, deps: InvokeDeps = {}, approved?: ApprovedContext): Promise<InvokeResult> {
  const now = (deps.now ?? (() => new Date()))();
  const cid = p.correlationId ?? `cap-${randomBytes(8).toString('hex')}`;
  const started = Date.now();
  const initiator: LedgerEntry['initiator'] = p.subject.type === 'OWNER' ? 'user' : 'automation';
  const base = { userId: p.userId, initiator, persona: p.persona ?? 'WHINK', tool: p.toolName, correlationId: cid };

  const deny = async (code: CapabilityErrorCode, reason: string, ids: { tool?: string; connector?: string; host?: string | null; grant?: string } = {}): Promise<never> => {
    let actionId: string | undefined;
    try {
      const r = await recordAction({
        ...base, action: 'capability_denied', permissionClass: 'C', status: 'DENIED',
        inputSummary: summarise(p.args), outputSummary: reason.slice(0, 300), errorCode: code,
        capabilityId: ids.tool, connectorInstallId: ids.connector, hostId: ids.host ?? undefined, grantId: ids.grant,
        approvalId: approved?.approvalId,
      });
      actionId = r.id;
    } catch (e) {
      logger.error('capability denial could not be ledgered', { userId: p.userId, error: (e as Error)?.message });
    }
    throw new CapabilityError(code, reason, actionId);
  };

  if (!isDataClass(p.dataClass)) return deny('VAL_INPUT_INVALID', 'dataClass is required');
  if (!p.args || typeof p.args !== 'object' || Array.isArray(p.args)) return deny('VAL_INPUT_INVALID', 'arguments must be an object');

  // 1. Identity. The team is derived from the roster, never taken from the caller.
  let teamId: string | null = null;
  if (p.subject.type === 'AGENT') {
    const agent = await resolveAgent(p.subject.agentId);
    if (!agent) return deny('AUTHZ_POLICY_DENIED', 'unknown agent');
    if (!agentMayAct(agent.state)) return deny('AUTHZ_POLICY_DENIED', `agent is ${agent.state}`);
    teamId = agent.teamId;
  }

  // 2. Load, always scoped to the account.
  const tool = await prisma.tool.findUnique({ where: { name: p.toolName } });
  const connector = tool?.connectorInstallId
    ? await prisma.connectorInstall.findFirst({ where: { id: tool.connectorInstallId, userId: p.userId, kind: 'MCP_SERVER' } })
    : null;
  if (!tool || !connector) return deny('RES_NOT_FOUND', 'unknown tool');
  const [host, grants, siblings] = await Promise.all([
    connector.hostId ? prisma.host.findFirst({ where: { id: connector.hostId, userId: p.userId } }) : Promise.resolve(null),
    prisma.capabilityGrant.findMany({ where: { userId: p.userId, toolId: tool.id, revokedAt: null } }),
    prisma.tool.findMany({ where: { connectorInstallId: connector.id }, select: { originalName: true, defHash: true, isActive: true } }),
  ]);
  const ids = { tool: tool.id, connector: connector.id, host: connector.hostId };

  // 3. Policy gates.
  const decision = evaluateGates({
    userId: p.userId,
    subject: p.subject.type === 'AGENT' ? { type: 'AGENT', agentId: p.subject.agentId, teamId } : { type: 'OWNER' },
    tool, connector, host, grants,
    currentFingerprint: providerFingerprint(connector, siblings),
    args: p.args, dataClass: p.dataClass, missionId: p.missionId ?? null, requestedScopes: p.requestedScopes,
    now, heartbeat: loadHeartbeatConfig(),
  });
  if (decision.effect === 'DENY') return deny(decision.code, decision.reason, ids);
  const grant = decision.grant;

  // 4. The permission engine. One engine, not a second copy of its rules.
  const cls = effectiveToolClass(tool);
  const protectedCall = classifyProtected({ toolName: tool.name, capability: tool.name, description: tool.description, params: p.args });
  const effectiveClass = protectedCall.protected ? 'C' : cls;
  let method = 'auto';
  if (approved) {
    if (!tool.defHash || tool.defHash !== approved.defHash) return deny('AUTHZ_POLICY_DENIED', 'tool definition changed since approval; not run', ids);
    const perm = await checkApprovedAction(p.userId, approved.approvalId, tool.name, approved.contentHash);
    if (!perm.allowed) return deny('AUTHZ_POLICY_DENIED', perm.reason ?? 'approval not valid', ids);
    method = 'human_approved';
  } else {
    const perm = await checkPermission(p.userId, tool.name, effectiveClass, cid, { params: p.args });
    if (!perm.allowed) {
      // Not allowed to run now. Ask the Founder, by request id; nothing is sent anywhere.
      const params: ApprovedParams = {
        args: p.args, defHash: tool.defHash ?? '', dataClass: p.dataClass, missionId: p.missionId ?? null,
        requestedScopes: p.requestedScopes ?? [], subject: p.subject,
      };
      const approval = await createApproval({
        userId: p.userId, kind: 'tool_call', tool: tool.name, params, persona: p.persona ?? 'WHINK', correlationId: cid,
        summary: `Run ${tool.originalName ?? tool.name} on provider ${connector.connectorId} (${p.subject.type === 'OWNER' ? 'Founder test' : 'agent request'})`.slice(0, 300),
      });
      const row = await recordAction({
        ...base, action: 'capability_awaiting_approval', permissionClass: 'C', status: 'AWAITING_APPROVAL',
        inputSummary: summarise(p.args), outputSummary: (perm.reason ?? 'approval required').slice(0, 300),
        capabilityId: tool.id, connectorInstallId: connector.id, hostId: connector.hostId, grantId: grant?.id, approvalId: approval.id,
        protectedCategory: protectedCall.protected ? protectedCall.category : undefined,
      });
      return { status: 'AWAITING_APPROVAL', approvalId: approval.id, actionId: row.id, reason: perm.reason ?? 'approval required' };
    }
    method = perm.method;
  }

  // 5. Atomic reservation against the grant's invocation cap. Two concurrent calls cannot both take the last slot.
  if (grant) {
    const reserved = await prisma.$executeRaw`
      UPDATE capability_grants
         SET "invocationCount" = "invocationCount" + 1, "lastInvokedAt" = ${now}
       WHERE id = ${grant.id} AND "userId" = ${p.userId} AND "revokedAt" IS NULL AND "expiresAt" > ${now}
         AND ("maxInvocations" IS NULL OR "invocationCount" < "maxInvocations")`;
    if (reserved !== 1) return deny('AUTHZ_POLICY_DENIED', 'grant exhausted, expired or revoked', { ...ids, grant: grant.id });
  }

  // 6. Write-ahead receipt. If it cannot be written, nothing runs.
  const receipt = await recordAction({
    ...base, action: 'capability_invoke', permissionClass: effectiveClass, status: 'SUBMITTED', confirmationMethod: method,
    inputSummary: summarise(p.args),
    capabilityId: tool.id, connectorInstallId: connector.id, hostId: connector.hostId, grantId: grant?.id, approvalId: approved?.approvalId,
    protectedCategory: protectedCall.protected ? protectedCall.category : undefined,
  });

  // 7. Execute.
  let output: string;
  try {
    let credential: string | null = null;
    if (connector.credentialsEnc) credential = decryptKey(connector.credentialsEnc);
    const conn: ProviderConn = { endpoint: connector.endpoint as string, egressAllowlist: connector.egressAllowlist, credential };
    output = await callProviderTool(conn, tool.originalName ?? tool.name, p.args, Math.min(tool.timeoutMs, MAX_TIMEOUT_MS), deps);
  } catch (e) {
    const code: CapabilityErrorCode = e instanceof ProviderError ? (e.code === 'EXEC_TIMEOUT' ? 'EXEC_TIMEOUT' : e.code === 'EGRESS_DENIED' ? 'EGRESS_DENIED' : 'EXEC_FAILED') : 'EXEC_FAILED';
    const message = e instanceof ProviderError ? e.message : 'Provider call could not be made';
    await updateActionStatus(p.userId, receipt.id, { status: 'FAILED', outputSummary: message, errorCode: code, latencyMs: Date.now() - started }).catch(() => false);
    throw new CapabilityError(code, message, receipt.id);
  }
  const closed = await updateActionStatus(p.userId, receipt.id, {
    status: 'EXECUTED',
    outputSummary: JSON.stringify({ chars: output.length, sha256: createHash('sha256').update(output).digest('hex') }),
    latencyMs: Date.now() - started,
  }).catch(() => false);
  if (!closed) logger.error('capability receipt could not be closed', { userId: p.userId, actionId: receipt.id });
  return { status: 'EXECUTED', output, actionId: receipt.id, untrusted: true };
}

// ── Approval execution ──────────────────────────────────────────────────────────────────────────

export interface ApprovedRow {
  id: string;
  tool: string;
  params: unknown;
  contentHash: string;
  correlationId: string;
  persona: string;
}

function parseApprovedParams(raw: unknown): ApprovedParams | null {
  const r = raw as Partial<ApprovedParams> | null;
  if (!r || typeof r !== 'object') return null;
  if (!r.args || typeof r.args !== 'object' || Array.isArray(r.args)) return null;
  if (typeof r.defHash !== 'string' || !isDataClass(r.dataClass)) return null;
  const s = r.subject as InvokeSubject | undefined;
  if (!s || (s.type !== 'OWNER' && !(s.type === 'AGENT' && typeof s.agentId === 'string'))) return null;
  return {
    args: r.args as Record<string, unknown>, defHash: r.defHash, dataClass: r.dataClass,
    missionId: typeof r.missionId === 'string' ? r.missionId : null,
    requestedScopes: Array.isArray(r.requestedScopes) ? r.requestedScopes.map(String) : [],
    subject: s.type === 'OWNER' ? { type: 'OWNER' } : { type: 'AGENT', agentId: s.agentId },
  };
}

/** Called by lib/approvals.ts after the Founder's decision won the atomic PENDING -> EXECUTING step. */
export async function executeApprovedCapability(
  userId: string,
  row: ApprovedRow,
  deps: InvokeDeps = {},
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const params = parseApprovedParams(row.params);
  if (!params) return { success: false, error: 'Approval does not describe a capability call; not run' };
  // The approved payload must hash to what the Founder saw. The permission engine re-checks this too.
  try {
    if (approvalContentHash({ kind: 'tool_call', tool: row.tool, params: row.params }) !== row.contentHash) {
      return { success: false, error: 'Approved content no longer matches; not run' };
    }
  } catch {
    return { success: false, error: 'Approved content no longer matches; not run' };
  }
  try {
    const res = await invokeCapability(
      {
        userId, subject: params.subject, toolName: row.tool, args: params.args, dataClass: params.dataClass,
        missionId: params.missionId, requestedScopes: params.requestedScopes, correlationId: row.correlationId, persona: row.persona,
      },
      deps,
      { approvalId: row.id, contentHash: row.contentHash, defHash: params.defHash },
    );
    if (res.status !== 'EXECUTED') return { success: false, error: 'Approval did not lead to execution' };
    // The output is untrusted external content; it is returned, never trusted or executed.
    return { success: true, data: { actionId: res.actionId, untrusted: true, output: res.output.slice(0, 8000) } };
  } catch (e) {
    return { success: false, error: e instanceof CapabilityError ? `${e.code}: ${e.message}` : 'Execution failed' };
  }
}
