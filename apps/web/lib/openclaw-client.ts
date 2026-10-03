/**
 * OpenClaw adapter — the only place in the codebase that talks to the
 * OpenClaw gateway. Keep all other code behind this interface so OpenClaw
 * can be swapped for a different gateway without touching tool-registry.ts.
 *
 * Wire protocol (subset used here):
 *   GET  {OPENCLAW_URL}/tools          → ToolDefinition[]
 *   POST {OPENCLAW_URL}/tools/:name    → any (tool result)
 *
 * All responses are treated as untrusted external content and must be
 * passed through wrapUntrustedContent before entering the model context.
 */

import type { ToolDefinition } from '@/lib/tool-loop';
import { scanForInjectionPatterns } from '@/lib/content-isolation';

const OPENCLAW_URL = (process.env.OPENCLAW_URL ?? 'http://localhost:3100').replace(/\/$/, '');
const OPENCLAW_NAME_RE = /^[a-z0-9_]{1,64}$/;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function assertTokenPresent(): void {
  const hostname = new URL(OPENCLAW_URL).hostname;
  const isLocal = LOCAL_HOSTNAMES.has(hostname);
  if (!isLocal && !process.env.OPENCLAW_TOKEN?.trim()) {
    throw new Error('OPENCLAW_TOKEN must be set for non-local OpenClaw endpoints');
  }
}
const MAX_LIST_BYTES = 256 * 1024; // 256 KB
const MAX_DESCRIPTION_LEN = 500;

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = process.env.OPENCLAW_TOKEN?.trim();
  const base: Record<string, string> = { Accept: 'application/json', ...extra };
  if (token) {
    base['Authorization'] = `Bearer ${token}`;
  }
  return base;
}

/**
 * Fetch the list of tools that OpenClaw currently has registered.
 * Throws on network error so callers can decide how to handle unavailability.
 * Validates and sanitises each tool definition before returning.
 */
export async function listOpenClawTools(): Promise<ToolDefinition[]> {
  assertTokenPresent();
  const res = await fetch(`${OPENCLAW_URL}/tools`, {
    headers: buildHeaders(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`OpenClaw /tools responded with ${res.status}`);
  }

  // M5: Cap response body at 256 KB before parsing
  const rawText = await res.text();
  const capped = rawText.substring(0, MAX_LIST_BYTES);

  let raw: unknown;
  try {
    raw = JSON.parse(capped);
  } catch {
    throw new Error('OpenClaw /tools returned invalid JSON');
  }

  if (!Array.isArray(raw)) {
    throw new Error('OpenClaw /tools returned a non-array payload');
  }

  const result: ToolDefinition[] = [];
  for (const item of raw as any[]) {
    const name = String(item?.name ?? '');

    // M5: Validate name
    if (!OPENCLAW_NAME_RE.test(name)) {
      console.warn(`[openclaw] skipping tool with invalid name: ${JSON.stringify(name)}`);
      continue;
    }

    // M5: Validate inputSchema is a plain object with type:'object'
    const schema = item?.inputSchema;
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) || schema.type !== 'object') {
      console.warn(`[openclaw] skipping tool ${name} — inputSchema missing or invalid`);
      continue;
    }

    // M5: Cap and sanitise description
    let description = String(item?.description ?? '').substring(0, MAX_DESCRIPTION_LEN);
    const descScan = scanForInjectionPatterns(description);
    if (descScan.suspicious) {
      console.warn(`[openclaw] stripping injection patterns from ${name} description`);
      description = `[description sanitised — ${descScan.patterns.join(', ')} detected]`;
    }

    result.push({
      name,
      description,
      inputSchema: schema as Record<string, unknown>,
    });
  }

  return result;
}

/**
 * Call a single OpenClaw tool by name and return its raw result.
 * The caller must treat the returned value as untrusted external content.
 */
export async function callOpenClawTool(toolName: string, params: unknown): Promise<unknown> {
  assertTokenPresent();
  const res = await fetch(`${OPENCLAW_URL}/tools/${encodeURIComponent(toolName)}`, {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params ?? {}),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`OpenClaw /tools/${toolName} responded with ${res.status}`);
  }

  return res.json();
}
