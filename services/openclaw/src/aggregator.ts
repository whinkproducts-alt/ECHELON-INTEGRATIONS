import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ServerConfig } from './config.js';
import { resolveHeaders, RESERVED_SOCIAL_PLATFORMS } from './config.js';
import { assignNames } from './namespace.js';
import { log } from './log.js';

export const MAX_DESCRIPTION_LEN = 500;
export const CREDENTIAL_META_KEY = 'dev.whink/credential';
const MAX_CREDENTIAL_CHARS = 8192;

/**
 * Build the upstream _meta for ONE call from the incoming one. Only the credential (a string) and the
 * MCP-standard progressToken pass; every other key is dropped. The result is never logged or stored.
 */
export function forwardMeta(incoming: unknown, allowCredential = false): Record<string, unknown> | undefined {
  if (!incoming || typeof incoming !== 'object') return undefined;
  const m = incoming as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const cred = m[CREDENTIAL_META_KEY];
  if (cred !== undefined && !allowCredential) {
    // Fixed message, never the value: only the validated built-in social connector may receive a credential.
    log.warn('credential dropped: upstream is not the built-in social connector');
  } else if (typeof cred === 'string' && cred.length > 0 && cred.length <= MAX_CREDENTIAL_CHARS) out[CREDENTIAL_META_KEY] = cred;
  const pt = m.progressToken;
  if (typeof pt === 'string' || typeof pt === 'number') out.progressToken = pt;
  return Object.keys(out).length > 0 ? out : undefined;
}

export const MAX_RESPONSE_CHARS = 64 * 1024;
const REFRESH_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 30_000;
const LIST_TIMEOUT_MS = 5_000;

/** What the gateway publishes for a tool. Deliberately no annotations or class hints. */
export interface PublishedTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; [k: string]: unknown };
}

export interface UpstreamTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  [k: string]: unknown;
}

/** Minimal client surface the aggregator needs, so tests can fake it. */
export interface UpstreamClient {
  listTools(params?: { cursor?: string }): Promise<{ tools: UpstreamTool[]; nextCursor?: string }>;
  callTool(
    params: { name: string; arguments?: Record<string, unknown>; _meta?: Record<string, unknown> },
    schema?: undefined,
    options?: { timeout?: number },
  ): Promise<{ content?: unknown; isError?: boolean }>;
  close(): Promise<void>;
}

export type Connector = (cfg: ServerConfig, env: Record<string, string | undefined>) => Promise<UpstreamClient>;

export const sdkConnector: Connector = async (cfg, env) => {
  const client = new Client({ name: 'whink-openclaw-gateway', version: '0.1.0' }, { capabilities: {} });
  if (cfg.transport === 'stdio') {
    const childEnv: Record<string, string> = { ...getDefaultEnvironment() };
    for (const n of cfg.envNames) {
      const v = env[n];
      if (v !== undefined) childEnv[n] = v;
      else log.warn('upstream env var not set', { platform: cfg.platform, name: n });
    }
    const transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env: childEnv,
      stderr: env.GATEWAY_UPSTREAM_STDERR === '1' ? 'inherit' : 'ignore',
    });
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
  } else {
    const { headers, missing } = resolveHeaders(cfg.headers, env);
    if (missing.length > 0) log.warn('upstream header env var not set', { platform: cfg.platform, names: missing });
    const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers },
      // Never follow redirects: a hostile upstream must not bounce credentials to another host (L-3).
      fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }),
      redirectPolicy: 'same-origin',
    });
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
  }
  return client as unknown as UpstreamClient;
};

interface Snapshot {
  tools: PublishedTool[];
  routes: Map<string, Route>;
}

function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fn().then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
}

interface Route {
  platform: string;
  original: string;
  /** Created from the validated reserved social config. Only these routes may receive a credential. */
  social: boolean;
}

function isObjectSchema(s: unknown): s is { type: 'object'; [k: string]: unknown } {
  return typeof s === 'object' && s !== null && !Array.isArray(s) && (s as { type?: unknown }).type === 'object';
}

export class Aggregator {
  private clients = new Map<string, UpstreamClient>();
  private routes = new Map<string, Route>();
  private snapshots = new Map<string, Snapshot>();
  private published: PublishedTool[] = [];
  private refreshedAt = 0;
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly configs: ServerConfig[],
    private readonly connector: Connector = sdkConnector,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  async listTools(): Promise<PublishedTool[]> {
    if (Date.now() - this.refreshedAt > REFRESH_MS) await this.refresh();
    return this.published;
  }

  refresh(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  /** Refresh every upstream in parallel. A failing upstream keeps its last good snapshot. */
  private async doRefresh(): Promise<void> {
    const results = await Promise.allSettled(this.configs.map((cfg) => this.refreshOne(cfg)));
    results.forEach((r, i) => {
      const cfg = this.configs[i];
      if (r.status === 'fulfilled') {
        this.snapshots.set(cfg.platform, r.value);
        log.info('upstream ready', { platform: cfg.platform, tools: r.value.tools.length });
      } else {
        const stale = this.snapshots.get(cfg.platform);
        log.warn('upstream unavailable', {
          platform: cfg.platform,
          kind: errName(r.reason),
          serving: stale ? 'last good snapshot' : 'nothing',
        });
        const dead = this.clients.get(cfg.platform);
        this.clients.delete(cfg.platform);
        if (dead) dead.close().catch(() => undefined);
      }
    });
    const published: PublishedTool[] = [];
    const routes = new Map<string, Route>();
    for (const cfg of this.configs) {
      const snap = this.snapshots.get(cfg.platform);
      if (!snap) continue;
      published.push(...snap.tools);
      for (const [k, v] of snap.routes) routes.set(k, v);
    }
    this.published = published;
    this.routes = routes;
    this.refreshedAt = Date.now();
  }

  private async refreshOne(cfg: ServerConfig): Promise<Snapshot> {
    let client = this.clients.get(cfg.platform);
    if (!client) {
      client = await this.connector(cfg, this.env);
      this.clients.set(cfg.platform, client);
    }
    const c = client;
    const tools = await withTimeout(LIST_TIMEOUT_MS, async () => {
      const all: UpstreamTool[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page++) {
        const res = await c.listTools(cursor ? { cursor } : undefined);
        all.push(...res.tools);
        cursor = res.nextCursor;
        if (!cursor) break;
      }
      return all;
    });
    const allow = cfg.tools ? new Set(cfg.tools) : null;
    const valid = tools.filter((t) => {
      if (allow && !(typeof t?.name === 'string' && allow.has(t.name))) return false;
      const ok = typeof t?.name === 'string' && isObjectSchema(t.inputSchema);
      if (!ok) log.warn('rejected upstream tool: missing name or object inputSchema', { platform: cfg.platform });
      return ok;
    });
    const { accepted, rejected } = assignNames(cfg.platform, valid);
    for (const r of rejected) log.warn('rejected upstream tool name', { platform: cfg.platform, tool: r.tool, reason: r.reason });
    const snap: Snapshot = { tools: [], routes: new Map() };
    for (const a of accepted) {
      snap.routes.set(a.exposed, {
        platform: cfg.platform,
        original: a.original,
        social: cfg.transport === 'stdio' && cfg.builtin === true && RESERVED_SOCIAL_PLATFORMS.has(cfg.platform),
      });
      snap.tools.push({
        name: a.exposed,
        description: String(a.tool.description ?? '').slice(0, MAX_DESCRIPTION_LEN),
        inputSchema: a.tool.inputSchema as PublishedTool['inputSchema'],
      });
    }
    return snap;
  }

  /** Forward one call. Arguments and results are never logged. */
  async callTool(
    exposed: string,
    args: Record<string, unknown> | undefined,
    meta?: unknown,
  ): Promise<{ content: { type: 'text'; text: string }[]; isError: boolean }> {
    if (this.routes.size === 0 || !this.routes.has(exposed)) await this.refresh();
    const route = this.routes.get(exposed);
    if (!route) return errorResult('unknown tool');
    const client = this.clients.get(route.platform);
    if (!client) return errorResult('upstream unavailable');
    try {
      const fwd = forwardMeta(meta, route.social);
      const res = await client.callTool(
        { name: route.original, arguments: args ?? {}, ...(fwd ? { _meta: fwd } : {}) },
        undefined,
        { timeout: CALL_TIMEOUT_MS },
      );
      return { content: [{ type: 'text', text: capContent(res.content) }], isError: res.isError === true };
    } catch (err) {
      // The error message is deliberately not logged: it can echo call arguments.
      log.warn('upstream call failed', { platform: route.platform, tool: exposed, kind: err instanceof Error ? err.name : 'unknown' });
      return errorResult('upstream call failed');
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.clients.values()].map((c) => c.close().catch(() => undefined)));
    this.clients.clear();
  }
}

/** Only the error class name is ever logged: messages and bodies can echo secrets or arguments. */
function errName(e: unknown): string {
  return e instanceof Error ? e.name : 'unknown';
}

function errorResult(text: string): { content: { type: 'text'; text: string }[]; isError: boolean } {
  return { content: [{ type: 'text', text }], isError: true };
}

/** Flatten upstream content to capped plain text. Non-text parts become a placeholder. */
export function capContent(content: unknown): string {
  const parts: string[] = [];
  if (Array.isArray(content)) {
    for (const p of content) {
      if (p && typeof p === 'object' && (p as { type?: unknown }).type === 'text' && typeof (p as { text?: unknown }).text === 'string') {
        parts.push((p as { text: string }).text);
      } else {
        const t = p && typeof p === 'object' ? String((p as { type?: unknown }).type ?? 'unknown').slice(0, 20) : 'unknown';
        parts.push(`[${t} content omitted]`);
      }
    }
  }
  const text = parts.join('\n');
  return text.length > MAX_RESPONSE_CHARS ? `${text.slice(0, MAX_RESPONSE_CHARS)}\n[truncated]` : text;
}
