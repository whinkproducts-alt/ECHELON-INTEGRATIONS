/**
 * Local-Only mode (WHINK_LOCAL_ONLY === 'true'): the model may use only tools that stay on this
 * machine. Enforced at two levels: resolveChatTools does not offer anything else, and
 * executeTool / executeApprovedTool deny it by name (ledgered, DENIED, 'local_only_mode').
 *
 * Every registered tool must be in exactly one list below. A test enumerates the registry and
 * fails when a new tool is in neither, so a new network-capable tool cannot slip through.
 * Anything not in LOCAL_ONLY_ALLOWED is denied, including the whole gateway (openclaw__*).
 */
import { WORKSPACE_TOOL_NAMES } from '@/lib/workspace-tools';

export const LOCAL_ONLY_REASON = 'local_only_mode';

export const LOCAL_ONLY_ALLOWED: ReadonlySet<string> = new Set([
  'memory_read', 'memory_write', 'memory_correct', 'entity_create', 'entity_update',
  'task_create', 'note_write', 'calendar_list',
  ...WORKSPACE_TOOL_NAMES,
]);

/** Reach the network, a person, a third party service or the document service. */
export const LOCAL_ONLY_DENIED: ReadonlySet<string> = new Set([
  'web_search', 'web_fetch',
  'document_search', 'document_upload', 'document_delete',
  'contact_message', 'contact_call', 'sms_briefing_send',
  'change_request_submit', 'social_schedule_post',
  'calendar_create',
]);

export function isLocalOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WHINK_LOCAL_ONLY === 'true';
}

/** True when the tool may run in Local-Only mode. Allow-list semantics: unknown means no. */
export function isAllowedInLocalOnly(toolName: string): boolean {
  return LOCAL_ONLY_ALLOWED.has(toolName);
}
