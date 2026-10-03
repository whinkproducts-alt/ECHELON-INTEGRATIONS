import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('executeTool registry gating', () => {
  const recordActionSafe = vi.fn();
  const recordAction = vi.fn();
  const updateActionStatus = vi.fn();
  const checkPermission = vi.fn();
  const writeMemory = vi.fn();
  const searchMemory = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    recordActionSafe.mockReset().mockResolvedValue({ id: 'row1' });
    recordAction.mockReset().mockResolvedValue({ id: 'row1' });
    updateActionStatus.mockReset().mockResolvedValue(true);
    checkPermission.mockReset();
    writeMemory.mockReset();
    searchMemory.mockReset();
    vi.doMock('@/lib/db', () => ({ prisma: {} }));
    vi.doMock('@/lib/ledger', () => ({ recordAction, recordActionSafe, updateActionStatus }));
    vi.doMock('@/lib/permission-engine', () => ({ checkPermission }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory, correctMemory: vi.fn(), searchMemory }));
    vi.doMock('@/lib/openclaw-client', () => ({ listOpenClawTools: vi.fn(), callOpenClawTool: vi.fn() }));
  });

  it('denies an unregistered tool, records DENIED, never checks permission or runs a handler', async () => {
    const { executeTool } = await import('../tool-registry');
    const res = await executeTool('u1', 'rm_rf_everything', { x: 1 }, 'WHINK', null, 'cid-1');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Unknown tool/);
    expect(checkPermission).not.toHaveBeenCalled();
    expect(writeMemory).not.toHaveBeenCalled();
    expect(searchMemory).not.toHaveBeenCalled();
    expect(recordActionSafe).toHaveBeenCalledTimes(1);
    const row = recordActionSafe.mock.calls[0][0];
    expect(row.status).toBe('DENIED');
    expect(row.userId).toBe('u1');
    expect(row.tool).toBe('rm_rf_everything');
    expect(row.correlationId).toBe('cid-1');
  });

  it('denies prototype-chain names like __proto__ and constructor', async () => {
    const { executeTool } = await import('../tool-registry');
    for (const name of ['__proto__', 'constructor', 'toString']) {
      const res = await executeTool('u1', name, {});
      expect(res.success).toBe(false);
    }
    expect(checkPermission).not.toHaveBeenCalled();
    expect(recordActionSafe.mock.calls.every((c) => c[0].status === 'DENIED')).toBe(true);
  });

  it('treats a registered tool with no risk map entry as Class C and does not run it', async () => {
    const openclaw = {
      listOpenClawTools: vi.fn().mockResolvedValue([{ name: 'send_thing', description: 'd', inputSchema: {} }]),
      callOpenClawTool: vi.fn(),
    };
    vi.doMock('@/lib/openclaw-client', () => openclaw);
    checkPermission.mockResolvedValue({ allowed: false, reason: 'Class C requires approval' });
    const { executeTool, registerOpenClawTools } = await import('../tool-registry');
    await registerOpenClawTools('u1');

    const res = await executeTool('u1', 'openclaw__send_thing', {});
    expect(res.success).toBe(false);
    expect(checkPermission).toHaveBeenCalledTimes(1);
    expect(checkPermission.mock.calls[0][2]).toBe('C');
    expect(openclaw.callOpenClawTool).not.toHaveBeenCalled();
    const row = recordActionSafe.mock.calls[0][0];
    expect(row.status).toBe('AWAITING_APPROVAL');
    expect(row.permissionClass).toBe('C');
  });

  it('known Class A tool is checked as A and runs when allowed', async () => {
    checkPermission.mockResolvedValue({ allowed: true, method: 'auto' });
    searchMemory.mockResolvedValue([]);
    const { executeTool } = await import('../tool-registry');
    const res = await executeTool('u1', 'memory_read', { query: 'x' });
    expect(res.success).toBe(true);
    expect(checkPermission.mock.calls[0][2]).toBe('A');
    expect(searchMemory).toHaveBeenCalled();
    // write-ahead SUBMITTED row, then finalised via updateActionStatus
    expect(recordAction).toHaveBeenCalledTimes(1);
    expect(recordAction.mock.calls[0][0].status).toBe('SUBMITTED');
    expect(recordAction.mock.invocationCallOrder[0]).toBeLessThan(searchMemory.mock.invocationCallOrder[0]);
    expect(updateActionStatus).toHaveBeenCalledWith('u1', 'row1', expect.objectContaining({ status: 'VALIDATED', latencyMs: expect.any(Number) }));
  });

  it('ledger pre-write failure: handler is never called and a failure result is returned', async () => {
    checkPermission.mockResolvedValue({ allowed: true, method: 'auto' });
    recordAction.mockRejectedValue(new Error('db down'));
    const { executeTool } = await import('../tool-registry');
    const res = await executeTool('u1', 'memory_read', { query: 'x' });
    expect(res.success).toBe(false);
    expect(searchMemory).not.toHaveBeenCalled();
    expect(updateActionStatus).not.toHaveBeenCalled();
  });

  it('handler throw finalises the pre-written row as FAILED', async () => {
    checkPermission.mockResolvedValue({ allowed: true, method: 'auto' });
    searchMemory.mockRejectedValue(new Error('boom'));
    const { executeTool } = await import('../tool-registry');
    const res = await executeTool('u1', 'memory_read', { query: 'x' });
    expect(res.success).toBe(false);
    expect(updateActionStatus).toHaveBeenCalledWith('u1', 'row1', expect.objectContaining({ status: 'FAILED' }));
  });
});
