/**
 * WHINK Org-Kit Approval Handler
 *
 * A chat message can never approve anything. Approvals go through the approval card or a
 * spoken approval that names the request id (lib/approvals.ts). This module only detects
 * bare approval phrases (to refuse them) and formats the dispatch message.
 */

import type { ExecutionAuthorizationRequest } from "@whink/org-kit";

// ── Approval detection ────────────────────────────────────────────────────────

const APPROVAL_PATTERNS: RegExp[] = [
  /^approved\.?$/i,
  /^approve\.?$/i,
  /^yes,?\s*approved\.?$/i,
  /^go ahead\.?$/i,
  /^proceed\.?$/i,
  /^authorize[d]?\.?$/i,
  /^confirmed?\.?$/i,
  /^✅\s*(approved)?\.?$/i,
  /^(yes|yep|yeah),?\s*go\.?$/i,
];

/** "Approve all", "always approve", "approve everything": blanket or standing approvals do not exist. */
const BULK_APPROVAL_PATTERNS: RegExp[] = [
  /^(please\s+)?(approve|approved|authori[sz]e|authori[sz]ed)\s+(all|both|everything|every request|them all|all of them|all requests|all pending)\b/i,
  /^(yes|yep|yeah|ok|okay|sure)[\s,]+(to\s+)?(all|both|everything|them all)\s*[.!]?$/i,
  /^(always|auto|automatically)[\s-]+(approve|authori[sz]e)\b/i,
  /^(approve|authori[sz]e)\b.{0,20}\b(from now on|going forward|in future|every time)\b/i,
];

/** Detection only. A match approves nothing. */
export function isApprovalMessage(message: string): boolean {
  const m = message.trim();
  return APPROVAL_PATTERNS.some((re) => re.test(m)) || (BULK_APPROVAL_PATTERNS.some((re) => re.test(m)));
}

export const BARE_APPROVAL_REPLY =
  "Approvals go through the approval card (or say approve while I read it out) \u2014 nothing was approved from chat.";

export function buildDispatchMessage(ear: ExecutionAuthorizationRequest, persona: string = "WHINK"): string {
  const header =
    persona === "MAMBA"
      ? "🐍 **MAMBA — ANALYSIS QUEUED**"
      : "⚡ **WHINK — ANALYSIS QUEUED**";

  const supportingLine =
    ear.supporting_agents.length > 0
      ? `\n**Supporting:** ${ear.supporting_agents.join(", ")}`
      : "";

  const gapLine =
    ear.capability_gaps.length > 0
      ? `\n\n⚠️ **Capability gaps remain:** ${ear.capability_gaps.join(", ")}. I'll flag these as blockers during execution.`
      : "";

  const dispatchMessage = `${header}

**Objective:** ${ear.objective}

**Lead Agent:** ${ear.lead_agent ?? "None assigned"}${supportingLine}
**Team Size:** ${ear.team_size}${gapLine}

---

The approved internal analysis is persisted for the worker. Queued does not mean running or completed. No tools, outbound actions or paid inference are authorized. Execution status and cancellation are available on the execution receipt.`;

  return dispatchMessage;
}
