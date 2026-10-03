/**
 * WHINK Org-Kit Approval Handler
 *
 * Detects "Approved" replies and dispatches the authorized team.
 * Execution only begins after Victor (Kaycee) explicitly approves an EAR.
 */

import { prisma } from "@/lib/db";
import { recordAction, updateActionStatus } from "@/lib/ledger";
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

export function isApprovalMessage(message: string): boolean {
  return APPROVAL_PATTERNS.some((re) => re.test(message.trim()));
}

// ── Pending EAR lookup ────────────────────────────────────────────────────────

export async function findPendingEAR(
  userId: string
): Promise<{ actionId: string; ear: ExecutionAuthorizationRequest } | null> {
  const action = await prisma.action.findFirst({
    where: {
      userId,
      action: "execution_authorization_request",
      status: "AWAITING_APPROVAL",
    },
    orderBy: { createdAt: "desc" },
  });

  if (!action?.validationResult) return null;

  try {
    const ear = JSON.parse(action.validationResult) as ExecutionAuthorizationRequest;
    return { actionId: action.id, ear };
  } catch {
    return null;
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export interface DispatchResult {
  dispatched: true;
  actionId: string;
  ear: ExecutionAuthorizationRequest;
  dispatchMessage: string;
}

export interface DispatchSkipped {
  dispatched: false;
  reason: "no_pending_ear" | "not_approval";
}

export type ApprovalOutcome = DispatchResult | DispatchSkipped;

export async function handleApproval(
  userId: string,
  message: string,
  persona: string = "WHINK"
): Promise<ApprovalOutcome> {
  if (!isApprovalMessage(message)) return { dispatched: false, reason: "not_approval" };

  const pending = await findPendingEAR(userId);
  if (!pending) return { dispatched: false, reason: "no_pending_ear" };

  const { actionId, ear } = pending;

  // Mark the EAR as approved
  const updated = await updateActionStatus(userId, actionId, {
    status: "VALIDATED",
    confirmationMethod: "user_confirmed",
  });
  if (!updated) return { dispatched: false, reason: "no_pending_ear" };

  // Log the dispatch action
  await recordAction({
    userId,
    initiator: "user",
    persona,
    action: "agent_dispatch",
    permissionClass: "S",
    confirmationMethod: "user_confirmed",
    status: "VALIDATED",
    inputSummary: `Approval received for: ${ear.objective?.substring(0, 200)}`,
    outputSummary: `Dispatched: ${ear.lead_agent ?? "No lead"} + ${ear.team_size - 1} supporting`,
    validationResult: JSON.stringify({ approved_ear_id: actionId, ear }),
  });

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

  return { dispatched: true, actionId, ear, dispatchMessage };
}
