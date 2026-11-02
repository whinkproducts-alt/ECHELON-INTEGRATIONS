/** A real MCP server (official SDK, Streamable HTTP, stateless) for gateway tests. No mocks of the protocol. */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

export interface MockCall { tool: string; args: Record<string, unknown>; authorization: string | null; at: number }
export interface MockMcp {
  url: string;
  host: string;
  calls: MockCall[];
  close: () => Promise<void>;
}

export async function startMockMcp(opts: { tools?: Array<{ name: string; description?: string }>; delayMs?: number } = {}): Promise<MockMcp> {
  const calls: MockCall[] = [];
  const toolDefs = opts.tools ?? [{ name: 'echo', description: 'Echo the supplied text back' }];
  const build = (authorization: string | null): McpServer => {
    const s = new McpServer({ name: 'mock', version: '1.0.0' });
    for (const t of toolDefs) {
      s.registerTool(t.name, { description: t.description ?? t.name, inputSchema: { text: z.string().optional() } }, async (args: { text?: string }) => {
        calls.push({ tool: t.name, args: args as Record<string, unknown>, authorization, at: Date.now() });
        if (opts.delayMs) await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
        return { content: [{ type: 'text' as const, text: `echo: ${args.text ?? ''}` }] };
      });
    }
    return s;
  };
  const server = http.createServer((req, res) => {
    if (req.url !== '/mcp' || req.method !== 'POST') { res.statusCode = 404; res.end(); return; }
    let raw = '';
    req.on('data', (c: Buffer) => { raw += c.toString(); });
    req.on('end', async () => {
      try {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => { void transport.close(); });
        const mcp = build(typeof req.headers.authorization === 'string' ? req.headers.authorization : null);
        await mcp.connect(transport);
        await transport.handleRequest(req, res, JSON.parse(raw));
      } catch {
        if (!res.headersSent) { res.statusCode = 500; res.end(); }
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    host: `127.0.0.1:${port}`,
    calls,
    close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

/** A listener that must never be contacted (egress tests). */
export async function startForbiddenListener(): Promise<{ url: string; connections: number; close: () => Promise<void> }> {
  const state = { connections: 0 };
  const server = http.createServer((_q, r) => { r.end('should not be reached'); });
  server.on('connection', () => { state.connections += 1; });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    get connections() { return state.connections; },
    close: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
