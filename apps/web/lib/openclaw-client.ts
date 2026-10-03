/**
 * OpenClaw adapter. The only place in WHINK that knows the gateway transport
 * (MCP over streamable HTTP). Keep all other code behind listOpenClawTools and
 * callOpenClawTool so the gateway can be swapped by rewriting this one file.
 *
 * The gateway re-exposes upstream MCP servers as `<platform>__<tool>`.
 * Everything it returns is untrusted external content. It never decides a
 * permission class: WHINK assigns classes from config/tool-classes.json.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ToolDefinition } from '@/lib/tool-loop';
import { logger } from '@/lib/logger';
import { sanitiseToolDefinition } from '@/lib/tool-definition';

/** Errors whose message is a fixed string, safe to surface. Upstream text never goes into one. */
class GatewayError extends Error {}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** Gateway-side name shape. The full WHINK name (openclaw__ + this) is checked in tool-registry. */
const GATEWAY_NAME_RE = /^[A-Za-z0-9_]{1,54}$/;
const MAX_LIST_BYTES = 256 * 1024;
const MAX_RESULT_CHARS = 64 * 1024;
const MAX_LIST_PAGES = 10;
const LIST_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 30_000;

/**
 * The gateway is opt-in. With OPENCLAW_URL unset or empty it is disabled: no
 * network call is made, and callers offer standard tools only.
 */
export function isGatewayConfigured(): boolean {
  return Boolean(process.env.OPENCLAW_URL?.trim());
}

function endpoint(): URL {
  const configured = process.env.OPENCLAW_URL?.trim();
  if (!configured) throw new GatewayError('OpenClaw gateway is disabled (OPENCLAW_URL is not set)');
  const base = configured.replace(/\/+$/, '');
  const url = new URL(base.endsWith('/mcp') ? base : `${base}/mcp`);
  // L7: a bearer token must never cross the network in clear text.
  if (!LOCAL_HOSTNAMES.has(url.hostname) && url.protocol !== 'https:') {
    throw new GatewayError('OpenClaw endpoint must use https for non-local hosts');
  }
  return url;
}

/** Log upstream error text server-side only: token redacted, truncated. */
function logUpstream(what: string, err: unknown): void {
  let text = err instanceof Error ? err.message : String(err);
  const token = process.env.OPENCLAW_TOKEN?.trim();
  if (token) text = text.split(token).join('[redacted]');
  logger.warn(`openclaw ${what} failed`, { detail: text.slice(0, 300) });
}

function statusOf(err: unknown): number | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'number' && code >= 100 && code <= 599 ? code : null;
}

function assertTokenPresent(url: URL): void {
  const isLocal = LOCAL_HOSTNAMES.has(url.hostname);
  if (!isLocal && !process.env.OPENCLAW_TOKEN?.trim()) {
    throw new GatewayError('OPENCLAW_TOKEN must be set for non-local OpenClaw endpoints');
  }
}

async function withClient<T>(timeoutMs: number, fn: (client: Client) => Promise<T>): Promise<T> {
  const url = endpoint();
  assertTokenPresent(url);
  const token = process.env.OPENCLAW_TOKEN?.trim();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers, signal: AbortSignal.timeout(timeoutMs) },
  });
  const client = new Client({ name: 'whink', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport, { timeout: timeoutMs });
    return await fn(client);
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    logUpstream('request', err);
    const status = statusOf(err);
    throw new GatewayError(status ? `OpenClaw gateway request failed (status ${status})` : 'OpenClaw gateway request failed');
  } finally {
    await client.close().catch(() => undefined);
  }
}

/**
 * List the tools the gateway currently exposes. Throws on network or protocol
 * error so callers can decide how to handle unavailability. Each definition is
 * validated and sanitised. Any annotation or class hint is dropped.
 */
export async function listOpenClawTools(): Promise<ToolDefinition[]> {
  const rawTools = await withClient(LIST_TIMEOUT_MS, async (client) => {
    const all: unknown[] = [];
    let cursor: string | undefined;
    let bytes = 0;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const res = await client.listTools(cursor ? { cursor } : undefined, { timeout: LIST_TIMEOUT_MS });
      bytes += JSON.stringify(res.tools).length;
      if (bytes > MAX_LIST_BYTES) throw new GatewayError('OpenClaw tool list exceeds size cap');
      all.push(...res.tools);
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    return all;
  });

  const result: ToolDefinition[] = [];
  for (const item of rawTools as Array<Record<string, unknown> | null>) {
    const name = String(item?.name ?? '');
    if (!GATEWAY_NAME_RE.test(name)) {
      console.warn(`[openclaw] skipping tool with invalid name: ${JSON.stringify(name).slice(0, 80)}`);
      continue;
    }

    const schema = item?.inputSchema as Record<string, unknown> | undefined;
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.type !== 'object') {
      console.warn(`[openclaw] skipping tool ${name}: inputSchema missing or invalid`);
      continue;
    }

    const clean = sanitiseToolDefinition({ description: item?.description, inputSchema: schema });
    if (!clean.ok) {
      // Name only: never log the offending text.
      console.warn(`[openclaw] rejecting tool ${name}: definition failed sanitisation (${clean.reason})`);
      continue;
    }

    result.push({ name, description: clean.definition.description, inputSchema: clean.definition.inputSchema });
  }
  return result;
}

/**
 * Call one gateway tool by its gateway name and return its text result, capped.
 * The caller must treat the returned value as untrusted external content.
 * A tool-level error is thrown so the permission and ledger layers see a failure.
 */
export async function callOpenClawTool(toolName: string, params: unknown): Promise<unknown> {
  const args = params && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, unknown>) : {};
  const res = await withClient(CALL_TIMEOUT_MS, (client) =>
    client.callTool({ name: toolName, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS }),
  );

  const parts: string[] = [];
  const content: unknown = res.content;
  if (Array.isArray(content)) {
    for (const p of content as Array<Record<string, unknown> | null>) {
      if (p && p.type === 'text' && typeof p.text === 'string') parts.push(p.text);
      else parts.push(`[${String(p?.type ?? 'unknown').slice(0, 20)} content omitted]`);
    }
  }
  const joined = parts.join('\n');
  const text = joined.length > MAX_RESULT_CHARS ? `${joined.slice(0, MAX_RESULT_CHARS)}\n[truncated]` : joined;

  if (res.isError === true) {
    logUpstream('tool call', new Error(text));
    throw new GatewayError('OpenClaw tool reported an error');
  }
  return text;
}
