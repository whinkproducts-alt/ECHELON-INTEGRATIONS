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

/** Detection only. A match approves nothing. */
export function isApprovalMessage(message: string): boolean {
  return APPROVAL_PATTERNS.some((re) => re.test(message.trim()));
}

export const BARE_APPROVAL_REPLY =
  "Approvals go through the approval card (or say approve while I read it out) \u2014 nothing was approved from chat.";

export function buildDispatchMessage(ear: ExecutionAuthorizationRequest, persona: string = "WHINK"): string {
  const header =
    persona === "MAMBA"
      ? "🐍 **MAMBA — TEAM DISPATCHED**"
      : "⚡ **WHINK — TEAM DISPATCHED**";

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

Team is active. I'll report milestones, surface blockers, and request your input before any irreversible action. You can say **"Stand down"** at any point to pause execution.`;

  return dispatchMessage;
}
