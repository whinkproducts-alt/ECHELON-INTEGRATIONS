/**
 * Org-tier approval logic for Class C tools (browser automation, etc.)
 *
 * Authority descends from founder → Wink/Mamba → Board → Subsidiary Director →
 * Director → Department Head → Team Lead → Agent. Each tier can approve its own
 * level and below; only escalates when necessary.
 *
 * Design principle: Victor (founder) ONLY sees:
 *   - Money spend
 *   - Reputational damage risk
 *   - Destructive damage risk
 *   - Existential threat
 * Everything else is handled internally by the organizational structure.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { recordAction } from '@/lib/ledger';
import { createApproval } from '@/lib/approvals';
import type { PermissionCheckResult } from '@/lib/permission-engine';

// ── Org Tier Hierarchy (descending authority) ───────────────────────────

export type OrgTier =
  | 'founder'        // Victor — only sees money/reputational/destructive
  | 'wink_mamba'     // Wink/Mamba — framework policy, not individual requests
  | 'board'          // Board — strategic pivots
  | 'subsidiary_dir' // Subsidiary Director — regional patterns
  | 'director'       // Division Director — divisional policy
  | 'dept_head'      // Department Head — departmental boundaries
  | 'team_lead'      // Team Lead — team-level browsing
  | 'agent';         // Agent — operational execution

export interface TierDefinition {
  tier: OrgTier;
  label: string;
  /** Which classes this tier can auto-approve without escalation. */
  autoApproveClasses: Set<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'>;
  /** Which classes MUST escalate to the tier above. */
  escalationClasses: Set<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'>;
  /** When this tier should notify but not block. */
  notifyOnlyClasses: Set<'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H'>;
}

/**
 * Tier definitions mapping org roles to approval authority.
 * Authority goes down: each tier handles its own level unless escalation is needed.
 */
export const TIER_DEFINITIONS: Record<OrgTier, TierDefinition> = {
  founder: {
    tier: 'founder',
    label: 'Founder (Victor)',
    autoApproveClasses: new Set(['A', 'B']),
    escalationClasses: new Set([]),
    notifyOnlyClasses: new Set([]),
  },
  wink_mamba: {
    tier: 'wink_mamba',
    label: 'Wink / Mamba (Senior Leadership)',
    autoApproveClasses: new Set(['A', 'B', 'C', 'D', 'E']),
    escalationClasses: new Set(['F', 'G', 'H']),
    notifyOnlyClasses: new Set(['F']),
  },
  board: {
    tier: 'board',
    label: 'Board of Directors',
    autoApproveClasses: new Set(['A', 'B', 'C', 'D', 'E', 'F']),
    escalationClasses: new Set(['G', 'H']),
    notifyOnlyClasses: new Set(['G']),
  },
  subsidiary_dir: {
    tier: 'subsidiary_dir',
    label: 'Subsidiary Director',
    autoApproveClasses: new Set(['A', 'B', 'C', 'D', 'E']),
    escalationClasses: new Set(['F', 'G', 'H']),
    notifyOnlyClasses: new Set(['F']),
  },
  director: {
    tier: 'director',
    label: 'Division Director',
    autoApproveClasses: new Set(['A', 'B', 'C', 'D']),
    escalationClasses: new Set(['E', 'F', 'G', 'H']),
    notifyOnlyClasses: new Set(['D']),
  },
  dept_head: {
    tier: 'dept_head',
    label: 'Department Head',
    autoApproveClasses: new Set(['A', 'B', 'C']),
    escalationClasses: new Set(['D', 'E', 'F', 'G', 'H']),
    notifyOnlyClasses: new Set(['C']),
  },
  team_lead: {
    tier: 'team_lead',
    label: 'Team Lead',
    autoApproveClasses: new Set(['A', 'B']),
    escalationClasses: new Set(['C', 'D', 'E', 'F', 'G', 'H']),
    notifyOnlyClasses: new Set(['B']),
  },
  agent: {
    tier: 'agent',
    label: 'Agent',
    autoApproveClasses: new Set(['A']),
    escalationClasses: new Set(['B', 'C', 'D', 'E', 'F', 'G', 'H']),
    notifyOnlyClasses: new Set([]),
  },
};

// ── Browser Approval Classes (mapped to tiers) ──────────────────────────
// Each class maps to the org tier that should handle approval:

export type BrowserApprovalClass =
  | 'C1' // URL whitelist — auto-allow, no human
  | 'C2' // Team lead notification — agent proceeds, team lead gets informed
  | 'C3' // Department head — approves cross-team domains
  | 'C4' // Director — divisional policy changes
  | 'C5' // Subsidiary Director — regional patterns
  | 'C6' // Wink / Mamba — framework policy shifts
  | 'C7' // Board — strategic pivots
  | 'H'  // Founder — money/reputational/destructive risk ONLY

export interface BrowserApprovalRule {
  class: BrowserApprovalClass;
  tier: OrgTier;
  description: string;
  autoAllow: boolean;
  notify: OrgTier | null;
  requiresApproval: OrgTier | null;
}

/**
 * Browser approval rules mapping classes to org tiers.
 * Victor only sees 'H' class (money/reputational/destructive).
 */
export const BROWSER_APPROVAL_RULES: Readonly<Record<BrowserApprovalClass, BrowserApprovalRule>> = Object.freeze({
  C1: {
    class: 'C1',
    tier: 'agent',
    description: 'URL whitelist — auto-allowed, no human approval needed',
    autoAllow: true,
    notify: null,
    requiresApproval: null,
  },
  C2: {
    class: 'C2',
    tier: 'team_lead',
    description: 'Non-whitelist URL — team lead notified, agent proceeds',
    autoAllow: true,
    notify: 'team_lead',
    requiresApproval: null,
  },
  C3: {
    class: 'C3',
    tier: 'dept_head',
    description: 'Cross-team domain — department head approval required',
    autoAllow: false,
    notify: null,
    requiresApproval: 'dept_head',
  },
  C4: {
    class: 'C4',
    tier: 'director',
    description: 'Divisional policy change — director approval required',
    autoAllow: false,
    notify: null,
    requiresApproval: 'director',
  },
  C5: {
    class: 'C5',
    tier: 'subsidiary_dir',
    description: 'Regional pattern — subsidiary director approval required',
    autoAllow: false,
    notify: null,
    requiresApproval: 'subsidiary_dir',
  },
  C6: {
    class: 'C6',
    tier: 'wink_mamba',
    description: 'Framework policy shift — Wink/Mamba approval required',
    autoAllow: false,
    notify: null,
    requiresApproval: 'wink_mamba',
  },
  C7: {
    class: 'C7',
    tier: 'board',
    description: 'Strategic pivot — Board approval required',
    autoAllow: false,
    notify: null,
    requiresApproval: 'board',
  },
  H: {
    class: 'H',
    tier: 'founder',
    description: 'Money spend / reputational damage / destructive damage — Founder (Victor) ONLY',
    autoAllow: false,
    notify: null,
    requiresApproval: 'founder',
  },
});

// ── Classification Logic ─────────────────────────────────────────────────

export interface BrowserClassificationResult {
  class: BrowserApprovalClass;
  tier: OrgTier;
  autoAllow: boolean;
  requiresApprovalFrom: OrgTier | null;
  notifyTier: OrgTier | null;
  reason: string;
}

/**
 * Classifies a browser tool invocation into an org-tier approval class.
 *
 * Classification flow:
 *  1. If URL is on the provider's egress allow-list → C1 (auto-allow)
 *  2. If URL is non-sensitive and agent acts within team scope → C2 (team lead notify, auto-proceed)
 *  3. If cross-team domain or unfamiliar → C3 (dept head approval)
 *  4. If divisional policy change → C4 (director approval)
 *  5. If regional pattern → C5 (subsidiary director approval)
 *  6. If framework policy shift → C6 (Wink/Mamba approval)
 *  7. If strategic pivot → C7 (Board approval)
 *  8. If money spend, reputational risk, or destructive damage → H (Victor ONLY)
 */
export function classifyBrowserApproval(
  url: string | null | undefined,
  context: {
    capability: string;
    requesterTier: OrgTier;
    requesterRoleId?: string;
    missionId?: string;
    isCrossTeam?: boolean;
    isDivisionalPolicy?: boolean;
    isRegionalPattern?: boolean;
    isFrameworkShift?: boolean;
    isStrategicPivot?: boolean;
    isMoneySpend?: boolean;
    isReputationalRisk?: boolean;
    isDestructiveRisk?: boolean;
    isWhitelistUrl?: boolean;
  }
): BrowserClassificationResult {
  const { capability, requesterTier, requesterRoleId, missionId, isCrossTeam, isDivisionalPolicy,
          isRegionalPattern, isFrameworkShift, isStrategicPivot, isMoneySpend,
          isReputationalRisk, isDestructiveRisk, isWhitelistUrl } = context;

  // ── H: Founder ONLY — money/reputational/destructive ──
  if (isMoneySpend || isReputationalRisk || isDestructiveRisk) {
    return {
      class: 'H',
      tier: 'founder',
      autoAllow: false,
      requiresApprovalFrom: 'founder',
      notifyTier: null,
      reason: `Browser action ${capability} triggers founder-level risk: ${
        isMoneySpend ? 'money spend' : ''
      }${isReputationalRisk ? 'reputational risk' : ''}${isDestructiveRisk ? 'destructive damage' : ''}. Victor (Founder) must approve directly.`,
    };
  }

  // ── C1: Auto-allow URL whitelist ──
  if (isWhitelistUrl === true || Boolean(url) && isWhitelistUrl !== false && !isCrossTeam) {
    return {
      class: 'C1',
      tier: 'agent',
      autoAllow: true,
      requiresApprovalFrom: null,
      notifyTier: null,
      reason: `Browser action ${capability} on URL whitelist — auto-allowed.`,
    };
  }

  // ── C2: Team lead notification, agent proceeds ──
  if (requesterTier === 'agent' || requesterTier === 'team_lead') {
    return {
      class: 'C2',
      tier: 'team_lead',
      autoAllow: true,
      requiresApprovalFrom: null,
      notifyTier: 'team_lead',
      reason: `Browser action ${capability} — non-whitelist URL. Team lead notified; agent proceeds.`,
    };
  }

  // ── C3: Department head approval ──
  if (requesterTier === 'dept_head' || isCrossTeam) {
    return {
      class: 'C3',
      tier: 'dept_head',
      autoAllow: false,
      requiresApprovalFrom: 'dept_head',
      notifyTier: null,
      reason: `Browser action ${capability} — cross-team domain. Department head approval required.`,
    };
  }

  // ── C4: Director approval ──
  if (requesterTier === 'director' || isDivisionalPolicy) {
    return {
      class: 'C4',
      tier: 'director',
      autoAllow: false,
      requiresApprovalFrom: 'director',
      notifyTier: null,
      reason: `Browser action ${capability} — divisional policy change. Director approval required.`,
    };
  }

  // ── C5: Subsidiary Director approval ──
  if (requesterTier === 'subsidiary_dir' || isRegionalPattern) {
    return {
      class: 'C5',
      tier: 'subsidiary_dir',
      autoAllow: false,
      requiresApprovalFrom: 'subsidiary_dir',
      notifyTier: null,
      reason: `Browser action ${capability} — regional pattern. Subsidiary director approval required.`,
    };
  }

  // ── C6: Wink/Mamba approval ──
  if (requesterTier === 'wink_mamba' || isFrameworkShift) {
    return {
      class: 'C6',
      tier: 'wink_mamba',
      autoAllow: false,
      requiresApprovalFrom: 'wink_mamba',
      notifyTier: null,
      reason: `Browser action ${capability} — framework policy shift. Wink/Mamba approval required.`,
    };
  }

  // ── C7: Board approval ──
  if (requesterTier === 'board' || isStrategicPivot) {
    return {
      class: 'C7',
      tier: 'board',
      autoAllow: false,
      requiresApprovalFrom: 'board',
      notifyTier: null,
      reason: `Browser action ${capability} — strategic pivot. Board approval required.`,
    };
  }

  // Default fallback: C2 team lead notification
  return {
    class: 'C2',
    tier: 'team_lead',
    autoAllow: true,
    requiresApprovalFrom: null,
    notifyTier: 'team_lead',
    reason: `Browser action ${capability} — default C2 tier. Team lead notified.`,
  };
}

// ── Approval Request Creation ────────────────────────────────────────────

export interface BrowserApprovalParams {
  userId: string;
  agentId?: string;
  toolName: string;
  args: Record<string, unknown>;
  classification: BrowserClassificationResult;
  correlationId?: string;
}

/**
 * Create an approval request for a browser action that needs human approval.
 * Victor only sees class 'H' approvals; other tiers see their own tier's approvals.
 */
export async function createBrowserApproval(params: BrowserApprovalParams): Promise<{ approvalId: string; status: string; message: string }> {
  const { userId, toolName, args, classification, correlationId } = params;

  const summary = `Browser tool ${toolName}: ${classification.reason}`;

  // Create an approval request that routes to the appropriate org tier
  const approval = await createApproval({
    userId,
    kind: 'tool_call',
    tool: toolName,
    params: {
      args,
      tool: toolName,
      browserClass: classification.class,
      browserTier: classification.tier,
      requiresApprovalFrom: classification.requiresApprovalFrom,
      correlationId: correlationId ?? null,
    },
    persona: 'WHINK',
    correlationId,
    summary: summary.slice(0, 300),
  });

  return {
    approvalId: approval.id,
    status: 'PENDING_APPROVAL',
    message: `Browser action ${toolName} requires approval at ${classification.tier} tier (class ${classification.class}). ${classification.reason}`,
  };
}

// ── Permission Check for Org Tiers ──────────────────────────────────────

export interface BrowserPermissionCheckResult extends PermissionCheckResult {
  browserClass?: BrowserApprovalClass;
  orgTier?: OrgTier;
  escalationTier?: OrgTier | null;
}

/**
 * Check whether a browser action can proceed given the requester's org tier.
 * Returns whether auto-allowed, requires approval, or needs escalation.
 */
export async function checkBrowserPermission(
  userId: string,
  toolName: string,
  args: Record<string, unknown>,
  ctx: {
    requesterTier?: OrgTier;
    requesterRoleId?: string;
    missionId?: string;
    isCrossTeam?: boolean;
    isDivisionalPolicy?: boolean;
    isRegionalPattern?: boolean;
    isFrameworkShift?: boolean;
    isStrategicPivot?: boolean;
    isMoneySpend?: boolean;
    isReputationalRisk?: boolean;
    isDestructiveRisk?: boolean;
    url?: string;
  } = {}
): Promise<BrowserPermissionCheckResult> {
  const requesterTier = ctx.requesterTier ?? 'agent';
  const url = ctx.url ?? args?.url ?? null;

  const classification = classifyBrowserApproval(url, {
    capability: toolName,
    requesterTier,
    requesterRoleId: ctx.requesterRoleId,
    missionId: ctx.missionId,
    isCrossTeam: ctx.isCrossTeam,
    isDivisionalPolicy: ctx.isDivisionalPolicy,
    isRegionalPattern: ctx.isRegionalPattern,
    isFrameworkShift: ctx.isFrameworkShift,
    isStrategicPivot: ctx.isStrategicPivot,
    isMoneySpend: ctx.isMoneySpend,
    isReputationalRisk: ctx.isReputationalRisk,
    isDestructiveRisk: ctx.isDestructiveRisk,
    isWhitelistUrl: args?.whitelistUrl !== false && Boolean(url), // default: URL on whitelist if present
  });

  // ── C1: auto-allow ──
  if (classification.autoAllow) {
    return {
      allowed: true,
      method: 'auto',
      browserClass: classification.class,
      orgTier: classification.tier,
      reason: classification.reason,
    };
  }

  // ── Needs approval from tier ──
  if (classification.requiresApprovalFrom) {
    return {
      allowed: false,
      method: 'requires_confirmation',
      protected: false,
      category: 'browser',
      browserClass: classification.class,
      orgTier: classification.tier,
      escalationTier: classification.requiresApprovalFrom,
      reason: classification.reason,
    };
  }

  // ── Fallback ──
  return {
    allowed: false,
    method: 'requires_confirmation',
    protected: false,
    category: 'browser',
    browserClass: classification.class,
    orgTier: classification.tier,
    escalationTier: 'founder',
    reason: `Browser action ${toolName}: cannot determine approval tier; escalating to founder.`,
  };
}
