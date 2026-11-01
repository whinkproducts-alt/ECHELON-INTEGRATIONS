/** Phase 2d D4: the credential travels only in MCP request _meta, for one call, and is redacted from logs. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const callTool = vi.fn();
const warn = vi.fn();

async function load() {
  vi.doMock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: class {
      connect = vi.fn().mockResolvedValue(undefined);
      listTools = vi.fn();
      callTool = callTool;
      close = vi.fn().mockResolvedValue(undefined);
    },
  }));
  vi.doMock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({ StreamableHTTPClientTransport: class {} }));
  vi.doMock('@/lib/logger', () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn(), security: vi.fn() } }));
  return import('@/lib/openclaw-client');
}

const CRED = JSON.stringify({ access_token: 'AT-very-secret-123', platform_user_id: '42' });

describe('callOpenClawTool credential option', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.OPENCLAW_URL = 'http://localhost:3100';
    delete process.env.OPENCLAW_TOKEN;
  });
  afterEach(() => vi.restoreAllMocks());

  it('sends the credential in _meta under dev.whink/credential and keeps it out of the arguments', async () => {
    callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const { callOpenClawTool } = await load();
    await callOpenClawTool('x__read_mentions', { max_results: 5 }, { credential: CRED });
    const req = callTool.mock.calls[0][0];
    expect(req).toEqual({ name: 'x__read_mentions', arguments: { max_results: 5 }, _meta: { 'dev.whink/credential': CRED } });
    expect(JSON.stringify(req.arguments)).not.toContain('AT-very-secret-123');
  });

  it('sends no _meta when there is no credential', async () => {
    callTool.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const { callOpenClawTool } = await load();
    await callOpenClawTool('ref__echo', {});
    expect(callTool.mock.calls[0][0]).toEqual({ name: 'ref__echo', arguments: {} });
  });

  it('redacts the credential and the bare token from a tool-error log line', async () => {
    callTool.mockResolvedValue({ isError: true, content: [{ type: 'text', text: `upstream echoed ${CRED} and AT-very-secret-123` }] });
    const { callOpenClawTool } = await load();
    await expect(callOpenClawTool('x__post', { text: 'a' }, { credential: CRED })).rejects.toThrow(/tool reported an error/);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('AT-very-secret-123');
    expect(logged).toContain('[redacted]');
  });

  it('redacts the credential from a transport failure log line, and the thrown error is generic', async () => {
    callTool.mockRejectedValue(new Error(`boom ${CRED}`));
    const { callOpenClawTool } = await load();
    await expect(callOpenClawTool('x__post', { text: 'a' }, { credential: CRED })).rejects.toThrow('OpenClaw gateway request failed');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('AT-very-secret-123');
  });
});
