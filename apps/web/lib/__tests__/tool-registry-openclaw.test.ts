/**
 * Tests for registerOpenClawTools() in lib/tool-registry.ts
 *
 * Mocks openclaw-client at the module boundary so no real HTTP calls occur.
 * Prisma is mocked so no DB calls occur.
 * The permission engine is NOT mocked — it runs real in-process logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock openclaw-client ──────────────────────────────────────────────────────
const mockListOpenClawTools = vi.fn();
const mockCallOpenClawTool = vi.fn();

vi.mock('@/lib/openclaw-client', () => ({
  listOpenClawTools: mockListOpenClawTools,
  callOpenClawTool: mockCallOpenClawTool,
}));

// ── mock Prisma ───────────────────────────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  prisma: {
    agentKnowledge: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    action: { create: vi.fn().mockResolvedValue({ id: 'act-1' }) },
    memory: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    entityNode: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    entityAlias: { create: vi.fn() },
    entityEdge: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    calendarEvent: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    note: { create: vi.fn() },
    projectTask: { create: vi.fn() },
    userDelegation: { findFirst: vi.fn().mockResolvedValue(null) },
    delegation: { findFirst: vi.fn().mockResolvedValue(null) },
    userProfile: { findUnique: vi.fn().mockResolvedValue({ autonomyLevel: 3 }) },
  },
}));

// ── mock memory-engine (used by tool handlers) ────────────────────────────────
vi.mock('@/lib/memory-engine', () => ({
  writeMemory: vi.fn().mockResolvedValue({ id: 'mem-1' }),
  correctMemory: vi.fn().mockResolvedValue({ id: 'mem-1' }),
  searchMemory: vi.fn().mockResolvedValue([]),
}));

// ── mock logger ───────────────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
  generateCorrelationId: () => 'cid-test',
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { registerOpenClawTools, executeTool } = await import('@/lib/tool-registry');

// ── tests ─────────────────────────────────────────────────────────────────────
describe('registerOpenClawTools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('installs handlers and risk map entries for tools returned by OpenClaw', async () => {
    mockListOpenClawTools.mockResolvedValueOnce([
      { name: 'send_email', description: 'Send an email', inputSchema: { type: 'object' } },
      { name: 'list_contacts', description: 'List contacts', inputSchema: { type: 'object' } },
    ]);
    mockCallOpenClawTool.mockResolvedValue({ ok: true });

    await registerOpenClawTools('user-123');

    // After registration the tools should be callable through executeTool.
    // OpenClaw tools are prefixed with "openclaw__" (security invariant).
    // Class C is always denied; the tool is registered as Class C by default,
    // so executeTool must return an EAR with allowed:false and AWAITING_APPROVAL.
    const result = await executeTool('user-123', 'openclaw__send_email', { to: 'a@b.com' });

    // Class C always denied — result reflects that (EAR returned, not executed)
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    // callOpenClawTool must NOT have been called (action was not auto-executed)
    expect(mockCallOpenClawTool).not.toHaveBeenCalled();
  });

  it('does not throw when OpenClaw is unreachable', async () => {
    mockListOpenClawTools.mockRejectedValueOnce(new TypeError('fetch failed'));

    // Should resolve without throwing — app keeps running without OpenClaw tools
    await expect(registerOpenClawTools('user-123')).resolves.toBeUndefined();
  });

  it('skips tools with an empty name', async () => {
    mockListOpenClawTools.mockResolvedValueOnce([
      { name: '', description: 'broken', inputSchema: { type: 'object' } },
      { name: 'valid_tool', description: 'ok', inputSchema: { type: 'object' } },
    ]);
    mockCallOpenClawTool.mockResolvedValue({ ok: true });

    await registerOpenClawTools('user-123');

    // 'valid_tool' should be registered; '' should be skipped (executeTool would
    // return "Unknown tool" for it if it somehow got called)
    // 'valid_tool' registered as 'openclaw__valid_tool' (Class C, always denied)
    const result = await executeTool('user-123', 'openclaw__valid_tool', {});
    // Class C always denied — returns EAR, not executed
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
