import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Aggregator } from './aggregator.js';
import { log } from './log.js';

const MAX_BODY_BYTES = 1024 * 1024;

export function checkBearer(header: string | undefined, token: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false;
  const a = createHash('sha256').update(header.slice(7)).digest();
  const b = createHash('sha256').update(token).digest();
  return timingSafeEqual(a, b);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function buildMcpServer(agg: Aggregator): Server {
  const server = new Server({ name: 'whink-openclaw-gateway', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await agg.listTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = req.params.arguments as Record<string, unknown> | undefined;
    return agg.callTool(req.params.name, args, req.params._meta);
  });
  return server;
}

export const DEFAULT_ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]', 'openclaw'];

export function parseAllowedHosts(v: string | undefined): string[] {
  const list = (v ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ALLOWED_HOSTS;
}

function hostOnly(h: string): string {
  const v = h.toLowerCase();
  if (v.startsWith('[')) return v.slice(0, v.indexOf(']') + 1);
  return v.split(':')[0];
}

export function createGateway(agg: Aggregator, token: string, allowedHosts: string[] = DEFAULT_ALLOWED_HOSTS): HttpServer {
  if (!token) throw new Error('OPENCLAW_TOKEN is required');
  const hosts = new Set(allowedHosts.map((h) => h.toLowerCase()));
  return createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? '').split('?')[0];
      // DNS-rebinding defence: only known Host values. Browsers always send Origin on cross-site
      // requests, and WHINK's server-side client never does, so any Origin is refused.
      const hostHeader = req.headers.host;
      if (!hostHeader || !hosts.has(hostOnly(hostHeader))) return send(res, 403, { error: 'forbidden' });
      if (req.headers.origin !== undefined) return send(res, 403, { error: 'forbidden' });
      if (req.method === 'GET' && path === '/healthz') return send(res, 200, { status: 'ok' });
      if (path !== '/mcp') return send(res, 404, { error: 'not found' });
      if (!checkBearer(req.headers.authorization, token)) return send(res, 401, { error: 'unauthorized' });
      if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
      try {
        const body = await readBody(req);
        // Stateless: one server + transport per request.
        const server = buildMcpServer(agg);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
          // SDK-level DNS-rebinding protection as a second layer (Host already matched above).
          enableDnsRebindingProtection: true,
          allowedHosts: [hostHeader],
        });
        res.on('close', () => {
          void transport.close();
          void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (err) {
        log.warn('request failed', { kind: err instanceof Error ? err.name : 'unknown' });
        if (!res.headersSent) send(res, 400, { error: 'bad request' });
      }
    })();
  });
}
