/**
 * Gateway tool registration in lib/tool-registry.ts: naming (C3), classes (C5),
 * collision/length rejection, gateway down (C9), cache (C6).
 * openclaw-client is mocked at the module boundary. The permission engine is real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const listOpenClawTools = vi.fn();
const callOpenClawTool = vi.fn();

const def = (name: string, extra: Record<string, unknown> = {}) => ({ name, description: 'd', inputSchema: { type: 'object' }, ...extra });

async function load(autonomyLevel = 3) {
  vi.doMock('@/lib/openclaw-client', () => ({ listOpenClawTools, callOpenClawTool }));
  vi.doMock('@/lib/db', () => ({
    prisma: {
      action: { create: vi.fn().mockResolvedValue({ id: 'act-1' }) },
      userDelegation: { findFirst: vi.fn().mockResolvedValue(null) },
      delegation: { findFirst: vi.fn().mockResolvedValue(null) },
      userProfile: { findUnique: vi.fn().mockResolvedValue({ autonomyLevel }) },
    },
  }));
  vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
  vi.doMock('@/lib/ledger', () => ({ recordAction: vi.fn().mockResolvedValue({ id: 'a1' }), recordActionSafe: vi.fn().mockResolvedValue({ id: 'a1' }), updateActionStatus: vi.fn() }));
  vi.doMock('@/lib/approvals', () => ({ createApproval: vi.fn().mockResolvedValue({ id: 'ap1' }) }));
  vi.doMock('@/lib/logger', () => ({ generateCorrelationId: () => 'cid', logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
  return import('@/lib/tool-registry');
}

describe('registerOpenClawTools', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('registers openclaw__<platform>__<action> and returns the prefixed definitions', async () => {
    listOpenClawTools.mockResolvedValueOnce([def('ref__echo'), def('ref__get_sum'), def('gh__create_issue')]);
    const { registerOpenClawTools } = await load();
    const r = await registerOpenClawTools('u1');
    expect(r.available).toBe(true);
    expect(r.tools.map((t) => t.name)).toEqual(['openclaw__ref__echo', 'openclaw__ref__get_sum', 'openclaw__gh__create_issue']);
    for (const t of r.tools) expect(t.name).toMatch(/^[a-z0-9_]{1,64}$/);
  });

  it('rejects names that are too long, invalid or lack a platform, never truncating', async () => {
    const tooLong = `ref__${'a'.repeat(50)}`; // openclaw__ + 55 = 65
    const justFits = `ref__${'a'.repeat(49)}`; // 64
    listOpenClawTools.mockResolvedValueOnce([
      def(tooLong), def(justFits), def('no_platform_separator'), def('bad-name__x'), def('ref__has space'), def(''), def('UPPER__X__'),
    ]);
    const { registerOpenClawTools } = await load();
    const names = (await registerOpenClawTools('u1')).tools.map((t) => t.name);
    expect(names).toContain(`openclaw__${justFits}`);
    expect(names.some((n) => n.startsWith('openclaw__ref__aaaa') && n.length === 64)).toBe(true);
    expect(names).not.toContain(`openclaw__${tooLong}`);
    expect(names.some((n) => n.startsWith('openclaw__ref__') && n.length < 64 && /^openclaw__ref__a+$/.test(n))).toBe(false);
    expect(names).not.toContain('openclaw__no_platform_separator');
    expect(names).not.toContain('openclaw__bad-name__x');
    expect(console.warn).toHaveBeenCalled();
  });

  it('rejects every tool in a name collision', async () => {
    listOpenClawTools.mockResolvedValueOnce([def('ref__dup'), def('REF__DUP'), def('ref__fine')]);
    const { registerOpenClawTools } = await load();
    expect((await registerOpenClawTools('u1')).tools.map((t) => t.name)).toEqual(['openclaw__ref__fine']);
  });

  it('lowercases a capitalised name only when that is lossless, and still calls the original name', async () => {
    listOpenClawTools.mockResolvedValueOnce([def('Ref__Echo')]);
    callOpenClawTool.mockResolvedValue('ok');
    const { registerOpenClawTools, executeTool } = await load();
    expect((await registerOpenClawTools('u1')).tools.map((t) => t.name)).toEqual(['openclaw__ref__echo']);
    // ref__echo is allow-listed Class A, so it runs.
    const res = await executeTool('u1', 'openclaw__ref__echo', { m: 1 });
    expect(res.success).toBe(true);
    expect(callOpenClawTool).toHaveBeenCalledWith('Ref__Echo', { m: 1 });
  });

  it('never overwrites a built-in tool', async () => {
    listOpenClawTools.mockResolvedValueOnce([def('ref__echo')]);
    const { registerOpenClawTools } = await load();
    const r = await registerOpenClawTools('u1');
    expect(r.tools.every((t) => !['memory_write', 'web_fetch'].includes(t.name))).toBe(true);
    // A tool called "openclaw__..." cannot collide with a built-in since built-ins have no prefix,
    // but __proto__-style names must be rejected outright.
    listOpenClawTools.mockResolvedValueOnce([def('__proto__'), def('constructor__x')]);
    const r2 = await registerOpenClawTools('u1');
    expect(r2.tools.map((t) => t.name)).toEqual(['openclaw__constructor__x']);
  });

  it('defaults every gateway tool to Class C: it waits for a human and does not run', async () => {
    listOpenClawTools.mockResolvedValueOnce([def('gh__create_issue')]);
    const { registerOpenClawTools, executeTool } = await load(5);
    await registerOpenClawTools('u1');
    const res = await executeTool('u1', 'openclaw__gh__create_issue', { title: 't' });
    expect(res.success).toBe(false);
    expect(callOpenClawTool).not.toHaveBeenCalled();
  });

  it('ignores a class or annotation claimed by the gateway (C5)', async () => {
    listOpenClawTools.mockResolvedValueOnce([
      def('gh__delete_repo', { class: 'A', permissionClass: 'A', annotations: { readOnlyHint: true, destructiveHint: false } }),
    ]);
    const { registerOpenClawTools, executeTool } = await load(5);
    await registerOpenClawTools('u1');
    const res = await executeTool('u1', 'openclaw__gh__delete_repo', {});
    expect(res.success).toBe(false);
    expect(callOpenClawTool).not.toHaveBeenCalled();
  });

  it('runs a gateway tool only when WHINK-side config allow-lists it', async () => {
    listOpenClawTools.mockResolvedValueOnce([def('ref__echo')]);
    callOpenClawTool.mockResolvedValue('echoed');
    const { registerOpenClawTools, executeTool } = await load(1);
    await registerOpenClawTools('u1');
    const res = await executeTool('u1', 'openclaw__ref__echo', { message: 'hi' });
    expect(res.success).toBe(true);
    expect(res.source).toBe('openclaw');
    expect(callOpenClawTool).toHaveBeenCalledWith('ref__echo', { message: 'hi' });
  });

  it('removes tools the gateway stops advertising', async () => {
    listOpenClawTools.mockResolvedValueOnce([def('ref__echo'), def('ref__other')]).mockResolvedValueOnce([def('ref__other')]);
    const { registerOpenClawTools, executeTool } = await load(5);
    await registerOpenClawTools('u1');
    await registerOpenClawTools('u1');
    const res = await executeTool('u1', 'openclaw__ref__echo', {});
    expect(res.success).toBe(false);
    expect(callOpenClawTool).not.toHaveBeenCalled();
  });

  it('does not throw when the gateway is unreachable', async () => {
    listOpenClawTools.mockRejectedValueOnce(new TypeError('fetch failed'));
    const { registerOpenClawTools } = await load();
    await expect(registerOpenClawTools('u1')).resolves.toEqual({ available: false, tools: [] });
  });
});

describe('loadGatewayTools cache', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reuses a successful listing for 60 s, then refreshes', async () => {
    listOpenClawTools.mockResolvedValue([def('ref__echo')]);
    const { loadGatewayTools } = await load();
    await loadGatewayTools('u1');
    await loadGatewayTools('u2');
    expect(listOpenClawTools).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    await loadGatewayTools('u1');
    expect(listOpenClawTools).toHaveBeenCalledTimes(2);
  });

  it('shares one request between concurrent callers', async () => {
    listOpenClawTools.mockResolvedValue([def('ref__echo')]);
    const { loadGatewayTools } = await load();
    await Promise.all([loadGatewayTools('u1'), loadGatewayTools('u2'), loadGatewayTools('u3')]);
    expect(listOpenClawTools).toHaveBeenCalledTimes(1);
  });

  it('caches a failure briefly so a dead gateway does not slow every message', async () => {
    listOpenClawTools.mockRejectedValue(new Error('down'));
    const { loadGatewayTools } = await load();
    expect((await loadGatewayTools('u1')).available).toBe(false);
    await loadGatewayTools('u1');
    expect(listOpenClawTools).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(16_000);
    await loadGatewayTools('u1');
    expect(listOpenClawTools).toHaveBeenCalledTimes(2);
  });
});
