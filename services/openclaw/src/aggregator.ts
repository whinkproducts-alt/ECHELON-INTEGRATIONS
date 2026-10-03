import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ServerConfig } from './config.js';
import { resolveHeaders } from './config.js';
import { assignNames } from './namespace.js';
import { log } from './log.js';

export const MAX_DESCRIPTION_LEN = 500;
export const MAX_RESPONSE_CHARS = 64 * 1024;
const REFRESH_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 30_000;

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
    params: { name: string; arguments?: Record<string, unknown> },
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
    const transport = new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers } });
    await client.connect(transport, { timeout: CONNECT_TIMEOUT_MS });
  }
  return client as unknown as UpstreamClient;
};

interface Route {
  platform: string;
  original: string;
}

function isObjectSchema(s: unknown): s is { type: 'object'; [k: string]: unknown } {
  return typeof s === 'object' && s !== null && !Array.isArray(s) && (s as { type?: unknown }).type === 'object';
}

export class Aggregator {
  private clients = new Map<string, UpstreamClient>();
  private routes = new Map<string, Route>();
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

  private async doRefresh(): Promise<void> {
    const published: PublishedTool[] = [];
    const routes = new Map<string, Route>();
    for (const cfg of this.configs) {
      try {
        let client = this.clients.get(cfg.platform);
        if (!client) {
          client = await this.connector(cfg, this.env);
          this.clients.set(cfg.platform, client);
        }
        const tools: UpstreamTool[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 20; page++) {
          const res = await client.listTools(cursor ? { cursor } : undefined);
          tools.push(...res.tools);
          cursor = res.nextCursor;
          if (!cursor) break;
        }
        const valid = tools.filter((t) => {
          const ok = typeof t?.name === 'string' && isObjectSchema(t.inputSchema);
          if (!ok) log.warn('rejected upstream tool: missing name or object inputSchema', { platform: cfg.platform });
          return ok;
        });
        const { accepted, rejected } = assignNames(cfg.platform, valid);
        for (const r of rejected) log.warn('rejected upstream tool name', { platform: cfg.platform, tool: r.tool, reason: r.reason });
        for (const a of accepted) {
          routes.set(a.exposed, { platform: cfg.platform, original: a.original });
          published.push({
            name: a.exposed,
            description: String(a.tool.description ?? '').slice(0, MAX_DESCRIPTION_LEN),
            inputSchema: a.tool.inputSchema as PublishedTool['inputSchema'],
          });
        }
        log.info('upstream ready', { platform: cfg.platform, tools: accepted.length });
      } catch (err) {
        log.warn('upstream unavailable', { platform: cfg.platform, error: errMsg(err) });
        const dead = this.clients.get(cfg.platform);
        this.clients.delete(cfg.platform);
        if (dead) dead.close().catch(() => undefined);
      }
    }
    this.published = published;
    this.routes = routes;
    this.refreshedAt = Date.now();
  }

  /** Forward one call. Arguments and results are never logged. */
  async callTool(
    exposed: string,
    args: Record<string, unknown> | undefined,
  ): Promise<{ content: { type: 'text'; text: string }[]; isError: boolean }> {
    if (this.routes.size === 0 || !this.routes.has(exposed)) await this.refresh();
    const route = this.routes.get(exposed);
    if (!route) return errorResult('unknown tool');
    const client = this.clients.get(route.platform);
    if (!client) return errorResult('upstream unavailable');
    try {
      const res = await client.callTool({ name: route.original, arguments: args ?? {} }, undefined, { timeout: CALL_TIMEOUT_MS });
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

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
