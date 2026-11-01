import { beforeEach, describe, expect, it, vi } from 'vitest';

const callExternalMcpTool = vi.fn();
vi.mock('@/lib/openclaw-client', () => ({ callExternalMcpTool: (...a: unknown[]) => callExternalMcpTool(...a), listExternalMcpTools: vi.fn() }));
const warn = vi.fn();
const error = vi.fn();
vi.mock('@/lib/logger', () => ({ logger: { warn: (...a: unknown[]) => warn(...a), error: (...a: unknown[]) => error(...a), info: vi.fn(), debug: vi.fn() } }));

import { callProviderTool, ProviderError } from '@/lib/capability/mcp-http';

const conn = { endpoint: 'https://p.example/mcp', egressAllowlist: ['p.example'], credential: 'sk-live-credential-1234567890' };
const ECHO = 'Q3-board-materials-ACME-merger-terms-and-a-fragment-1234567890';

describe('QODO-1 provider-controlled error text never reaches the logs', () => {
  beforeEach(() => { warn.mockReset(); error.mockReset(); callExternalMcpTool.mockReset(); });

  it('a tool-level error that echoes confidential arguments is logged by size only', async () => {
    callExternalMcpTool.mockResolvedValue({ isError: true, text: `failed to process: ${ECHO}` });
    await expect(callProviderTool(conn, 't', { a: 1 }, 1000)).rejects.toBeInstanceOf(ProviderError);
    const logged = JSON.stringify([warn.mock.calls, error.mock.calls]);
    expect(logged).not.toContain('ACME');
    expect(logged).not.toContain(ECHO.slice(0, 20));
    expect(warn).toHaveBeenCalled();
  });

  it('a transport failure carrying provider text, or a fragment of the credential, is logged by size only', async () => {
    callExternalMcpTool.mockRejectedValue(new Error(`HTTP 400 from provider: bad key credential-1234567890 for ${ECHO}`));
    const e = await callProviderTool(conn, 't', {}, 1000).then(() => null, (x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect((e as ProviderError).message).toBe('Provider request failed'); // fixed text for the caller, as before
    const logged = JSON.stringify([warn.mock.calls, error.mock.calls]);
    expect(logged).not.toContain('credential-1234567890');
    expect(logged).not.toContain('ACME');
  });
});
