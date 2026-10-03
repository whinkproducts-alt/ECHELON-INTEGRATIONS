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
import { recordActionSafe } from '@/lib/ledger';
import type { ToolDefinition } from '@/lib/tool-loop';

export async function resolveChatTools(opts: {
  userId: string;
  standardTools: ToolDefinition[];
  persona: string;
  correlationId: string;
}): Promise<ToolDefinition[]> {
  let gateway: { available: boolean; disabled?: boolean; tools: ToolDefinition[] };
  try {
    gateway = await loadGatewayTools(opts.userId);
  } catch {
    gateway = { available: false, tools: [] };
  }

  // Gateway not configured: not an outage, so no network call and no ledger row.
  if (gateway.disabled) return opts.standardTools;

  if (!gateway.available) {
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
    return opts.standardTools;
  }

  // Standard tool names win: a gateway tool can never shadow one.
  const taken = new Set(opts.standardTools.map((t) => t.name));
  return [...opts.standardTools, ...gateway.tools.filter((t) => !taken.has(t.name))];
}
