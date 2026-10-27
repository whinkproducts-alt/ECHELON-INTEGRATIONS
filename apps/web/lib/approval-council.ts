/**
 * Late-approval council policy.
 *
 * This is intentionally deterministic and local: it does not call a model or a
 * connector while deciding whether an expired request may be reconsidered. The
 * council is a second policy gate, not a way around the protected-action rules.
 */
import { isGatewayTool } from '@/lib/gateway-access';
import { classifyProtected } from '@/lib/protected-actions';

export const COUNCIL_MEMBERS = ['WHINK', 'MAMBA'] as const;
export const COUNCIL_SIZE = 5;

// Directors are taken from the WHINK Group leadership registry. The selection
// below is shuffled deterministically per approval id so the audit trail can
// reproduce who was selected without relying on non-deterministic runtime state.
const DIRECTORS = [
  'Dr. Tinaye Muzenyi-Igboekwe', 'Tai Tamminga', 'Juliet Uchechukwu Igboekwe (JP)',
  'Atika Emmanuel', 'Luke Mellors', 'Dr. Amara Okafor', 'Dr. Elena Varga',
  'Alejandro Ruiz', 'Anthony C Igboekwe', 'Charles Soludo', 'Genevieve Igboekwe',
  'Victoria Ngozi Igboekwe', 'Bruno Fernades', 'Zaleena BeeHarry', 'Francis Lampard',
] as const;

// Deliberately narrow: council approval may auto-run only these read-only
// capabilities. Any write, connector, deployment, or ambiguous capability
// still requires the founder even when it is not classified as money movement.
const COUNCIL_READ_ONLY_TOOLS = new Set([
  'document_search', 'memory_read', 'calendar_list', 'connector_health', 'usage_read',
]);

export interface CouncilRow {
  id: string;
  kind: string;
  tool: string | null;
  params?: unknown;
  summary?: string;
}

export interface CouncilAssessment {
  eligible: boolean;
  reason: string;
  members: string[];
  votes: Array<{ member: string; approve: boolean; reason: string }>;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
}

function selectDirectors(seed: string): string[] {
  const pool = [...DIRECTORS];
  let state = hashSeed(seed);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, COUNCIL_SIZE - COUNCIL_MEMBERS.length);
}

function blockedReason(row: CouncilRow): string | null {
  if (row.kind !== 'tool_call') return 'Only internal tool actions may enter the late-approval council';
  if (!row.tool) return 'The request has no named capability';
  if (!COUNCIL_READ_ONLY_TOOLS.has(row.tool)) return 'Only explicitly read-only capabilities can be council-approved';
  if (isGatewayTool(row.tool)) return 'Connector and OpenClaw actions stay owner-approved; the council cannot cause external activity';
  const classification = classifyProtected({ toolName: row.tool, capability: row.tool, params: row.params });
  if (classification.protected) return `Protected ${classification.category ?? 'action'}: ${classification.reason}`;
  const text = `${row.tool} ${row.summary ?? ''}`.toLowerCase();
  if (/\b(send|email|mail|message|sms|call|post|publish|share|export|invite|contact|notify|webhook|social)\b/.test(text)) {
    return 'External communication or disclosure is never council-approved';
  }
  if (/\b(delete|destroy|drop|wipe|reset|deploy|production|merge|push|remove)\b/.test(text)) {
    return 'Potentially destructive or production-changing action requires the founder';
  }
  return null;
}

export function assessLateApproval(row: CouncilRow): CouncilAssessment {
  const selected = [...COUNCIL_MEMBERS, ...selectDirectors(row.id)];
  const blocked = blockedReason(row);
  const approve = blocked === null;
  const reason = blocked ?? 'Internal, non-monetary, non-destructive action passed the council safety policy';
  return {
    eligible: approve,
    reason,
    members: selected,
    votes: selected.map((member) => ({ member, approve, reason })),
  };
}

