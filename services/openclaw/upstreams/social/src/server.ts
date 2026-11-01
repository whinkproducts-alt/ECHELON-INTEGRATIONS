import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, type Platform } from './tools.js';
import { parseCredential, runX, MAX_OUTPUT_CHARS, type ToolResult } from './x.js';

export const CREDENTIAL_META_KEY = 'dev.whink/credential';

function toContent(r: ToolResult): { content: { type: 'text'; text: string }[]; isError: boolean } {
  let text = JSON.stringify(r.body);
  if (text.length > MAX_OUTPUT_CHARS) text = JSON.stringify({ error: 'output_too_large' });
  return { content: [{ type: 'text', text }], isError: r.isError };
}

/** Run one tool call. Exported for tests. No credential means no network call. */
export async function handleCall(platform: Platform, name: string, args: unknown, rawCredential: unknown) {
  if (!TOOLS[platform].some((t) => t.name === name)) return toContent({ isError: true, body: { error: 'unknown_tool' } });
  const cred = parseCredential(rawCredential);
  if (!cred) return toContent({ isError: true, body: { error: 'not_connected', platform } });
  if (platform !== 'x') {
    return toContent({ isError: true, body: { error: 'not_implemented', platform, reason: 'pending platform app review' } });
  }
  const a = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const schema = TOOLS.x.find((t) => t.name === name)!.inputSchema;
  for (const k of Object.keys(a)) {
    if (!(k in schema.properties)) return toContent({ isError: true, body: { error: 'invalid_input', field: 'unknown_property' } });
  }
  return toContent(await runX(name, a, cred));
}

export function buildServer(platform: Platform): Server {
  const server = new Server({ name: `whink-social-${platform}`, version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS[platform] }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const meta = req.params._meta as Record<string, unknown> | undefined;
    return handleCall(platform, req.params.name, req.params.arguments, meta?.[CREDENTIAL_META_KEY]);
  });
  return server;
}
