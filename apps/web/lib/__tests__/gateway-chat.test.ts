/** C6 and C9: the live chat path offers gateway tools, and survives a dead gateway. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadGatewayTools = vi.fn();
const recordActionSafe = vi.fn();
const std = [{ name: 'memory_read', description: 'r', inputSchema: { type: 'object' } }];
const gw = { name: 'openclaw__ref__echo', description: 'e', inputSchema: { type: 'object' } };

async function load() {
  vi.doMock('@/lib/tool-registry', () => ({ loadGatewayTools }));
  vi.doMock('@/lib/ledger', () => ({ recordActionSafe }));
  return import('@/lib/gateway-chat');
}
const opts = { userId: 'u1', standardTools: std, persona: 'WHINK', correlationId: 'c1' };

describe('resolveChatTools', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('offers standard tools plus gateway tools', async () => {
    loadGatewayTools.mockResolvedValueOnce({ available: true, tools: [gw] });
    const { resolveChatTools } = await load();
    expect((await resolveChatTools(opts)).map((t) => t.name)).toEqual(['memory_read', 'openclaw__ref__echo']);
    expect(recordActionSafe).not.toHaveBeenCalled();
  });

  it('never lets a gateway tool shadow a standard tool', async () => {
    loadGatewayTools.mockResolvedValueOnce({ available: true, tools: [{ ...gw, name: 'memory_read' }] });
    const { resolveChatTools } = await load();
    expect(await resolveChatTools(opts)).toEqual(std);
  });

  it('gateway down: standard tools only and exactly one gateway_unavailable ledger row', async () => {
    loadGatewayTools.mockResolvedValueOnce({ available: false, tools: [] });
    const { resolveChatTools } = await load();
    expect(await resolveChatTools(opts)).toEqual(std);
    expect(recordActionSafe).toHaveBeenCalledTimes(1);
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'gateway_unavailable', correlationId: 'c1', status: 'FAILED' }));
  });

  it('gateway disabled (OPENCLAW_URL unset): standard tools only and no ledger row', async () => {
    loadGatewayTools.mockResolvedValueOnce({ available: false, disabled: true, tools: [] });
    const { resolveChatTools } = await load();
    expect(await resolveChatTools(opts)).toEqual(std);
    expect(recordActionSafe).not.toHaveBeenCalled();
  });

  it('does not crash if the loader itself throws', async () => {
    loadGatewayTools.mockRejectedValueOnce(new Error('boom'));
    const { resolveChatTools } = await load();
    expect(await resolveChatTools(opts)).toEqual(std);
    expect(recordActionSafe).toHaveBeenCalledTimes(1);
  });
});
