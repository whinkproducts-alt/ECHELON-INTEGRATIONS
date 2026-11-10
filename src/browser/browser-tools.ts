/**
 * OpenClaw tool definitions for the Firefox browser automation tool.
 * These tool definitions are registered with OpenClaw so agents can invoke
 * browser actions through the existing capability gateway.
 */

import type { PolicyTool } from '@/lib/capability/policy';

/**
 * Describes each browser tool as it should appear in OpenClaw.
 * All tools are Class C by default — they require Victor approval.
 */
export const BROWSER_TOOLS: PolicyTool[] = [
  {
    id: 'browser_tool__navigate',
    name: 'browser_tool__navigate',
    isActive: true,
    costClass: 'FREE',
    riskClass: 'C',
    defHash: '',
    reviewedDefHash: null,
    connectorInstallId: 'browser_connector', // placeholder until registered
  },
  {
    id: 'browser_tool__click',
    name: 'browser_tool__click',
    isActive: true,
    costClass: 'FREE',
    riskClass: 'C',
    defHash: '',
    reviewedDefHash: null,
    connectorInstallId: 'browser_connector',
  },
  {
    id: 'browser_tool__type',
    name: 'browser_tool__type',
    isActive: true,
    costClass: 'FREE',
    riskClass: 'C',
    defHash: '',
    reviewedDefHash: null,
    connectorInstallId: 'browser_connector',
  },
  {
    id: 'browser_tool__screenshot',
    name: 'browser_tool__screenshot',
    isActive: true,
    costClass: 'FREE',
    riskClass: 'C',
    defHash: '',
    reviewedDefHash: null,
    connectorInstallId: 'browser_connector',
  },
  {
    id: 'browser_tool__close',
    name: 'browser_tool__close',
    isActive: true,
    costClass: 'FREE',
    riskClass: 'C',
    defHash: '',
    reviewedDefHash: null,
    connectorInstallId: 'browser_connector',
  },
];

export function toolId(action: string): string {
  return `browser_tool__${action}`;
}