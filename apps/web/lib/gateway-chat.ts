/**
 * Live chat path for gateway (OpenClaw) tools.
 *
 * Registers the gateway's tools (cached, see loadGatewayTools) and returns the
 * tool list to offer the model: the standard tools plus whatever the gateway
 * advertises. If the gateway is down, chat proceeds with standard tools only
 * and the ledger gets at most one 'gateway_unavailable' row for the request.
 * Permission classes are still decided per call inside executeTool.
 */

import { loadGatewayTools } from '@/lib/tool-registry';
import { canUseGateway } from '@/lib/gateway-access';
import { hasActiveConnection } from '@/lib/social/connections';
import { recordActionSafe } from '@/lib/ledger';
import { SOCIAL_SCHEDULE_TOOL, type ToolDefinition } from '@/lib/tool-loop';
import { workspaceToolDefinitions } from '@/lib/workspace-tools';
import { canUseWorkspaceTools } from '@/lib/workspace-tools/access';
import { isAllowedInLocalOnly, isLocalOnly } from '@/lib/workspace-tools/local-only';

export async function resolveChatTools(opts: {
  userId: string;
  standardTools: ToolDefinition[];
  persona: string;
  correlationId: string;
}): Promise<ToolDefinition[]> {
  // Local-Only mode: only local tools, no gateway, no connection lookups, no network.
  if (isLocalOnly()) {
    const wsDefs = workspaceToolDefinitions();
    const ws = wsDefs.length > 0 && (await canUseWorkspaceTools(opts.userId)) ? wsDefs : [];
    const local = [...opts.standardTools, ...ws].filter((t) => isAllowedInLocalOnly(t.name));
    return local.filter((t, i) => local.findIndex((u) => u.name === t.name) === i);
  }

  // The scheduling tool is offered only to a user with an active X connection.
  let base = opts.standardTools;
  try {
    if (!base.some((t) => t.name === SOCIAL_SCHEDULE_TOOL.name) && (await hasActiveConnection(opts.userId, 'x'))) {
      base = [...base, SOCIAL_SCHEDULE_TOOL];
    }
  } catch {
    base = opts.standardTools;
  }
  // Read-only workspace tools exist only when WHINK_LOCAL_AGENT_TOOLS and WHINK_WORKSPACE_ROOT are set.
  {
    const taken = new Set(base.map((t) => t.name));
    const wsDefs = workspaceToolDefinitions().filter((t) => !taken.has(t.name));
    const ws = wsDefs.length > 0 && (await canUseWorkspaceTools(opts.userId)) ? wsDefs : [];
    if (ws.length) base = [...base, ...ws];
  }

  // H1: owner-only gateway tools stay owner-only. Everyone else gets at most the social platforms,
  // which loadGatewayTools filters for them.
  const owner = await canUseGateway(opts.userId);

  let gateway: { available: boolean; disabled?: boolean; tools: ToolDefinition[] };
  try {
    gateway = await loadGatewayTools(opts.userId);
  } catch {
    gateway = { available: false, tools: [] };
  }

  // Gateway not configured: not an outage, so no network call and no ledger row.
  if (gateway.disabled) return base;

  if (!gateway.available) {
    // Only the owner gets an outage row: other users were never promised the gateway.
    if (owner) {
      await recordActionSafe({
        userId: opts.userId,
        initiator: 'system',
        persona: opts.persona,
        action: 'gateway_unavailable',
        tool: 'openclaw',
        permissionClass: 'A',
        status: 'FAILED',
        outputSummary: 'Gateway unreachable; this turn ran with standard tools only.',
        correlationId: opts.correlationId,
      });
    }
    return base;
  }

  // Standard tool names win: a gateway tool can never shadow one.
  const taken = new Set(base.map((t) => t.name));
  return [...base, ...gateway.tools.filter((t) => !taken.has(t.name))];
}
