/**
 * MCP client for Founder-registered providers (D-9: Streamable HTTP).
 *
 * The MCP transport itself lives in lib/openclaw-client.ts, the only file that knows it (boundary
 * test C4). This module adds what is specific to registered providers: every byte goes through the
 * egress allow-list (createAllowlistedFetch), the credential is decrypted by the caller for this one
 * call and only ever sent to the provider's own endpoint, and nothing the provider returns is trusted
 * (definitions are sanitised, results are capped and returned as untrusted text, upstream error text
 * is logged server-side only).
 */
import { callExternalMcpTool, listExternalMcpTools, type ExternalMcpConn } from '@/lib/openclaw-client';
import { createAllowlistedFetch, type EgressDeps } from '@/lib/capability/egress';
import { sanitiseToolDefinition, defHash } from '@/lib/tool-definition';
import { logger } from '@/lib/logger';

/** Fixed-text error: the message is safe to show; upstream text is never put in one. */
export class ProviderError extends Error {
  constructor(message: string, readonly code: 'EXEC_FAILED' | 'EXEC_TIMEOUT' | 'EGRESS_DENIED' = 'EXEC_FAILED') {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface ProviderConn {
  endpoint: string;
  egressAllowlist: readonly string[];
  /** Plaintext credential for this call only. */
  credential?: string | null;
}

const LIST_TIMEOUT_MS = 10_000;
const TOOL_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/;

function redact(text: string, secret?: string | null): string {
  return secret ? text.split(secret).join('[redacted]') : text;
}

function connFor(conn: ProviderConn, deps: EgressDeps): ExternalMcpConn {
  return {
    endpoint: conn.endpoint,
    fetch: createAllowlistedFetch({ allowlist: conn.egressAllowlist }, deps),
    headers: conn.credential ? { Authorization: `Bearer ${conn.credential}` } : {},
  };
}

/** Map any transport failure to a fixed-text ProviderError. Upstream text is logged (redacted), never returned. */
function fail(err: unknown, credential?: string | null): never {
  if (err instanceof ProviderError) throw err;
  const name = (err as { name?: string } | null)?.name;
  const msg = redact(err instanceof Error ? err.message : String(err), credential);
  logger.warn('capability provider request failed', { detail: msg.slice(0, 300) });
  if (/Egress denied/.test(msg)) throw new ProviderError('Provider destination is not on the egress allow-list', 'EGRESS_DENIED');
  if (name === 'TimeoutError' || name === 'AbortError' || /timed out|timeout/i.test(msg)) throw new ProviderError('Provider request timed out', 'EXEC_TIMEOUT');
  throw new ProviderError('Provider request failed');
}

export interface DiscoveredTool {
  originalName: string;
  description: string;
  inputSchema: Record<string, unknown>;
  defHash: string;
}

export interface DiscoveryResult {
  tools: DiscoveredTool[];
  /** Names (only) of tools that were dropped, with a fixed reason. Never upstream text. */
  rejected: Array<{ name: string; reason: string }>;
}

/** List and sanitise a provider's tools. Anything malformed or hostile is dropped, not repaired. */
export async function discoverTools(conn: ProviderConn, deps: EgressDeps = {}): Promise<DiscoveryResult> {
  let raw: unknown[];
  try {
    raw = await listExternalMcpTools(connFor(conn, deps), LIST_TIMEOUT_MS);
  } catch (e) {
    return fail(e, conn.credential);
  }

  const tools: DiscoveredTool[] = [];
  const rejected: DiscoveryResult['rejected'] = [];
  const seen = new Set<string>();
  for (const item of raw as Array<Record<string, unknown> | null>) {
    const name = String(item?.name ?? '');
    const label = name.slice(0, 64);
    if (!TOOL_NAME_RE.test(name)) { rejected.push({ name: label, reason: 'invalid name' }); continue; }
    if (seen.has(name)) { rejected.push({ name: label, reason: 'duplicate name' }); continue; }
    const schema = item?.inputSchema as Record<string, unknown> | undefined;
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.type !== 'object') {
      rejected.push({ name: label, reason: 'input schema missing or not an object' });
      continue;
    }
    const clean = sanitiseToolDefinition({ description: item?.description, inputSchema: schema });
    if (!clean.ok) { rejected.push({ name: label, reason: 'definition failed sanitisation' }); continue; }
    seen.add(name);
    tools.push({
      originalName: name,
      description: clean.definition.description,
      inputSchema: clean.definition.inputSchema as Record<string, unknown>,
      defHash: defHash(clean.definition),
    });
  }
  return { tools, rejected };
}

/** Call one tool. Returns capped text (untrusted). A tool-level error is thrown with a fixed message. */
export async function callProviderTool(
  conn: ProviderConn,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number,
  deps: EgressDeps = {},
): Promise<string> {
  let res: { text: string; isError: boolean };
  try {
    res = await callExternalMcpTool(connFor(conn, deps), toolName, args, timeoutMs);
  } catch (e) {
    return fail(e, conn.credential);
  }
  if (res.isError) {
    logger.warn('capability provider tool reported an error', { detail: redact(res.text, conn.credential).slice(0, 300) });
    throw new ProviderError('Provider tool reported an error');
  }
  return res.text;
}
