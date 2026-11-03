/** R07: every outbound boundary refuses while the account is locked down, before any I/O. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lockdownTestState } from './setup/lockdown-mock';

const fetchMock = vi.fn();
const recordActionSafe = vi.fn().mockResolvedValue({ id: 'r' });

beforeEach(() => {
  vi.resetModules();
  lockdownTestState.locked = true;
  fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  recordActionSafe.mockClear();
  vi.doMock('@/lib/ledger', () => ({ recordActionSafe, recordAction: vi.fn().mockResolvedValue({ id: 'r' }), updateActionStatus: vi.fn() }));
  vi.doMock('@/lib/db', () => ({ prisma: {} }));
  vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1', email: 'o@example.test' } }) }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('delivery', () => {
  it.each(['EMAIL', 'SMS', 'WHATSAPP', 'TELEGRAM', 'PHONE_CALL', 'IMESSAGE'] as const)('%s is refused with reason lockdown and no network call', async (channel) => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC' + 'a'.repeat(32));
    vi.stubEnv('TWILIO_AUTH_TOKEN', 't');
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15005550006');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:' + 'A'.repeat(35));
    const { deliver } = await import('@/lib/comms/delivery');
    const r = await deliver({ userId: 'u1', channel, to: '+14035550123', body: 'hi' });
    expect(r).toMatchObject({ sent: false, reason: 'lockdown' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sends again once the lockdown is released (no state kept in the adapter)', async () => {
    lockdownTestState.locked = false;
    const { deliver } = await import('@/lib/comms/delivery');
    const r = await deliver({ userId: 'u1', channel: 'TELEGRAM', to: '1', body: 'hi' });
    expect(r.reason).toBe('not_configured');
  });
});

describe('tools', () => {
  it('executeTool denies every tool and ledgers the denial', async () => {
    vi.doMock('@/lib/permission-engine', async () => ({ ...(await vi.importActual<object>('@/lib/permission-engine')), checkPermission: vi.fn().mockResolvedValue({ allowed: true, method: 'auto' }), checkApprovedAction: vi.fn() }));
    vi.doMock('@/lib/openclaw-client', () => ({ isGatewayConfigured: () => false, listOpenClawTools: vi.fn(), callOpenClawTool: vi.fn() }));
    const { executeTool } = await import('@/lib/tool-registry');
    for (const t of ['calendar_list', 'web_search', 'contact_message']) {
      const r = await executeTool('u1', t, {});
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Lockdown/);
    }
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'tool_execution_denied', outputSummary: 'lockdown', status: 'DENIED' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('speech routes', () => {
  it.each([['tts', '@/app/api/voice/tts/route'], ['stt', '@/app/api/voice/stt/route']])('%s returns 423 and calls no provider', async (_n, mod) => {
    vi.stubEnv('TTS_URL', 'http://127.0.0.1:8880');
    vi.stubEnv('STT_URL', 'http://127.0.0.1:9000');
    const { POST } = await import(mod);
    const res = await POST(new Request('http://x/api/voice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'hello' }) }) as never);
    expect(res.status).toBe(423);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('capability gateway', () => {
  it('invokeCapability is denied before any lookup', async () => {
    const recordAction = vi.fn().mockResolvedValue({ id: 'a1' });
    vi.doMock('@/lib/ledger', () => ({ recordAction, recordActionSafe, updateActionStatus: vi.fn() }));
    const { invokeCapability } = await import('@/lib/capability/invoke');
    await expect(invokeCapability({ userId: 'u1', subject: { type: 'OWNER' }, toolName: 't', args: {}, dataClass: 'organization', missionId: null, requestedScopes: [] } as never))
      .rejects.toMatchObject({ code: 'AUTHZ_POLICY_DENIED' });
    expect(recordAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'capability_denied', outputSummary: 'Lockdown is active' }));
  });
});

describe('worker', () => {
  it('a job claimed just before lockdown is not run and its lease is released without a status change', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    vi.doMock('@/lib/db', () => ({ prisma: { agentJob: { updateMany } } }));
    const { runClaimedJob } = await import('@/lib/worker/runner');
    const out = await runClaimedJob({ id: 'j1', jobKey: 'capability:abc', userId: 'u1', consecutiveFailures: 0, runs: 0 }, 'w1');
    expect(out).toBe('SKIPPED');
    expect(updateMany).toHaveBeenCalledWith({ where: { id: 'j1', userId: 'u1', leaseOwner: 'w1' }, data: { leaseUntil: null, leaseOwner: null } });
  });
});
