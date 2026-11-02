/** Loopback-only MCP facade. Requires a local bearer separate from the GitHub App key. */
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildHealthReport, configFromEnv } from '../lib/github-readonly/report';

const token = process.env.ECHELON_GITHUB_PROVIDER_TOKEN ?? '';
const port = Number(process.env.ECHELON_GITHUB_PROVIDER_PORT ?? '3197');
if (token.length < 32 || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Local provider configuration invalid');
const config = configFromEnv();
const server = http.createServer(async (req, res) => {
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  const a = Buffer.from(supplied), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) { res.writeHead(401).end(); return; }
  if (req.method !== 'POST' || req.url !== '/mcp') { res.writeHead(404).end(); return; }
  let raw = '';
  try {
    for await (const chunk of req) { raw += String(chunk); if (Buffer.byteLength(raw) > 32 * 1024) throw new Error('request too large'); }
    const message = JSON.parse(raw) as { method?: string; id?: string | number; params?: { name?: string; arguments?: unknown } };
    if (message.method === 'tools/call' && (message.params?.name !== 'repo_build_health' || !message.params.arguments || typeof message.params.arguments !== 'object' || Array.isArray(message.params.arguments) || Object.keys(message.params.arguments).length)) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id ?? null, result: { isError: true, content: [{ type: 'text', text: 'Tool or arguments denied' }] } }));
      return;
    }
    const mcp = new McpServer({ name: 'echelon-github-readonly', version: '1.0.0' });
    mcp.registerTool('repo_build_health', { description: 'Read existing build health for the fixed ECHELON repository. No arguments or writes.', inputSchema: {} }, async () => {
      try { return { content: [{ type: 'text', text: JSON.stringify(await buildHealthReport(config)) }] }; }
      catch { return { isError: true, content: [{ type: 'text', text: 'GitHub report unavailable; no evidence claimed' }] }; }
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, message);
  } catch { if (!res.headersSent) res.writeHead(400).end(); }
});
server.listen(port, '127.0.0.1');
