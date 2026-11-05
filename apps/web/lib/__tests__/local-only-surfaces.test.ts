/**
 * Local-Only: every outbound path in apps/web other than the model router (covered in local-only-router.test.ts).
 *
 * Audit of outbound connections (grep fetch(, nodemailer, https.request, MCP transport), state in Local-Only mode:
 *  - app/api/voice/tts (api.openai.com, Deepgram, TTS_URL)      BLOCKED unless TTS_URL is loopback        (tests below)
 *  - app/api/voice/stt (Deepgram, STT_URL)                      BLOCKED unless STT_URL is loopback         (tests below)
 *  - app/api/news + lib/news.ts (RSS feeds)                     BLOCKED                                    (tests below)
 *  - app/api/social/[platform]/connect, lib/social/oauth.ts     BLOCKED (connect, token exchange, identity)
 *  - lib/social/connections.ts token revoke                     SKIPPED (tokens still deleted locally)
 *  - lib/anythingllm-client.ts (document recall)                BLOCKED unless ANYTHINGLLM_URL is loopback; context-engine ledgers document_recall_unavailable
 *  - lib/comms/delivery.ts (SMTP, Twilio SMS/WhatsApp/call, Telegram) BLOCKED, deliver() returns local_only
 *  - lib/change-requests/github.ts (api.github.com)             BLOCKED
 *  - lib/openclaw-client.ts (gateway MCP)                       BLOCKED unless OPENCLAW_URL is loopback; tools also denied in the registry
 *  - lib/offline.ts connectivity probes                         BLOCKED for non-loopback targets
 *  - lib/tool-registry.ts web_search (Brave), web_fetch         BLOCKED in the registry and in the handlers
 *  - lib/model-router*.ts (chat, tools, embeddings)             BLOCKED unless loopback (local-only-router.test.ts)
 *  - browser-side fetch('/api/...') calls                       same-origin, not outbound
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fetchMock = vi.fn();
const recordActionSafe = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('WHINK_LOCAL_ONLY', 'true');
  fetchMock.mockReset().mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  recordActionSafe.mockReset().mockResolvedValue({ id: 'r' });
  vi.doMock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
  vi.doMock('@/lib/ledger', () => ({ recordActionSafe, recordAction: vi.fn(), updateActionStatus: vi.fn() }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.doUnmock('@/lib/anythingllm-client'); });

const ttsReq = () => new Request('http://x/api/voice/tts', { method: 'POST', body: JSON.stringify({ text: 'hello' }) }) as any;
const sttReq = () => new Request('http://x/api/voice/stt', { method: 'POST', body: 'x' }) as any;

describe('voice', () => {
  it.each([
    ['openai', { TTS_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' }],
    ['deepgram', { TTS_PROVIDER: 'deepgram', DEEPGRAM_API_KEY: 'dg' }],
    ['remote url', { TTS_URL: 'https://tts.example.com' }],
    ['lookalike url', { TTS_URL: 'http://127.0.0.1.evil.com:8880' }],
  ])('TTS %s is refused with a clear message and a ledger row, and never fetches', async (_n, env) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { POST } = await import('@/app/api/voice/tts/route');
    const res = await POST(ttsReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'Speech is not available in Local-Only mode' });
    expect(body.fallback).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ action: 'local_only_blocked', tool: 'voice_tts', status: 'DENIED', outputSummary: 'local_only' }));
  });
  it('TTS with a loopback service still works', async () => {
    vi.stubEnv('TTS_URL', 'http://127.0.0.1:8880');
    vi.doMock('@/lib/db', () => ({ prisma: {
      $queryRaw: async () => [{ id: 'user-1' }],
      $transaction: async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: async () => [{ id: 'user-1' }], usageEvent: { create: async () => ({ id: 'h' }), findFirst: async () => null, aggregate: async () => ({ _sum: {} }) }, userPreference: { findUnique: async () => null } }),
      usageEvent: { create: async () => ({ id: 'h' }), updateMany: async () => ({ count: 1 }), findFirst: async () => null, aggregate: async () => ({ _sum: {} }) },
      userPreference: { findUnique: async () => null },
      accountSafetyState: { findUnique: async () => null },
    } }));
    const { POST } = await import('@/app/api/voice/tts/route');
    const res = await POST(ttsReq());
    expect(res.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^http:\/\/127\.0\.0\.1:8880/);
  });
  it('TTS with nothing configured offers NO browser fallback (browser engines may use network voices)', async () => {
    const { POST } = await import('@/app/api/voice/tts/route');
    const res = await POST(ttsReq());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Speech is not available in Local-Only mode' });
  });
  it('outside Local-Only the browser fallback is unchanged', async () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', 'false');
    const { POST } = await import('@/app/api/voice/tts/route');
    const res = await POST(ttsReq());
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({ fallback: 'browser' });
  });
  it.each([
    ['deepgram', { STT_PROVIDER: 'deepgram', DEEPGRAM_API_KEY: 'dg' }],
    ['remote url', { STT_URL: 'https://stt.example.com' }],
  ])('STT %s is refused and never fetches', async (_n, env) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { POST } = await import('@/app/api/voice/stt/route');
    const res = await POST(sttReq());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Speech is not available in Local-Only mode');
    expect(body.fallback).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ tool: 'voice_stt', status: 'DENIED' }));
  });
  it('STT with nothing configured is refused too (no browser recognition)', async () => {
    const { POST } = await import('@/app/api/voice/stt/route');
    expect((await POST(sttReq())).status).toBe(503);
  });
  it('STT with a loopback service is not refused by Local-Only', async () => {
    vi.stubEnv('STT_URL', 'http://localhost:9000');
    const { POST } = await import('@/app/api/voice/stt/route');
    const res = await POST(sttReq());
    expect(res.status).not.toBe(503);
  });
});

describe('news', () => {
  it('the route refuses and the fetchers throw, with no network call', async () => {
    const { GET } = await import('@/app/api/news/route');
    const res = await GET(new Request('http://x/api/news?category=all'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('Not available in Local-Only mode');
    const { routeFetcher, safeFetcher } = await import('@/lib/news');
    await expect(routeFetcher('https://example.com/feed')).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    await expect(safeFetcher('https://example.com/feed')).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ tool: 'news_feed', action: 'local_only_blocked' }));
  });
});

describe('social connect', () => {
  it('refuses to start OAuth and never calls the platform', async () => {
    const startConnect = vi.fn();
    vi.doMock('@/lib/social/oauth', () => ({ startConnect }));
    const { POST } = await import('@/app/api/social/[platform]/connect/route');
    const res = await POST(new Request('http://x', { method: 'POST', body: '{}' }) as any, { params: Promise.resolve({ platform: 'x' }) });
    expect(res.status).toBe(503);
    expect(startConnect).not.toHaveBeenCalled();
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ tool: 'social_connect_x', status: 'DENIED' }));
  });
  it('the token exchange refuses before any request', async () => {
    vi.doUnmock('@/lib/social/oauth');
    vi.doMock('@/lib/db', () => ({ prisma: {} }));
    const oauth = await import('@/lib/social/oauth');
    await expect(oauth.postTokenRequest('x', { grant_type: 'authorization_code' })).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('document recall', () => {
  it('a non-loopback ANYTHINGLLM_URL is never queried', async () => {
    vi.stubEnv('ANYTHINGLLM_URL', 'https://docs.example.com');
    vi.stubEnv('ANYTHINGLLM_API_KEY', 'k');
    const c = await import('@/lib/anythingllm-client');
    await expect(c.queryDocuments('u1', 'slug', 'q')).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    await expect(c.listWorkspaces()).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
    expect(c.isAnythingLlmConfigured()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('a lookalike host is refused', async () => {
    vi.stubEnv('ANYTHINGLLM_URL', 'http://localhost.evil.com:3001');
    const c = await import('@/lib/anythingllm-client');
    await expect(c.queryDocuments('u1', 'slug', 'q')).rejects.toMatchObject({ name: 'LocalOnlyViolationError' });
  });
  it('a loopback service is queried', async () => {
    vi.stubEnv('ANYTHINGLLM_URL', 'http://127.0.0.1:3001');
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ sources: [] }), { status: 200 }));
    const c = await import('@/lib/anythingllm-client');
    await c.queryDocuments('u1', 'slug', 'q');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('context assembly skips documents and ledgers document_recall_unavailable', async () => {
    vi.stubEnv('ANYTHINGLLM_URL', 'https://docs.example.com');
    vi.doMock('@/lib/db', () => ({
      prisma: {
        memorySemantic: { findMany: vi.fn().mockResolvedValue([]) }, memoryEpisode: { findMany: vi.fn().mockResolvedValue([]) },
        entityNode: { findMany: vi.fn().mockResolvedValue([]) }, hypothesis: { findMany: vi.fn().mockResolvedValue([]) },
        project: { findFirst: vi.fn().mockResolvedValue(null) },
        documentWorkspace: { findUnique: vi.fn().mockResolvedValue({ workspaceSlug: 'ws' }) },
      },
    }));
    vi.doMock('@/lib/working-memory', () => ({ listWorkingMemory: vi.fn().mockResolvedValue([]) }));
    vi.doMock('@/lib/memory-engine', () => ({ searchMemory: vi.fn().mockResolvedValue({ semantics: [], episodes: [], hypotheses: [] }) }));
    const { assembleContext } = await import('@/lib/context-engine');
    const ctx = await assembleContext('u1', 'c1', null, undefined, 'what is in my contract');
    expect(ctx.documentCitations).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordActionSafe).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', action: 'document_recall_unavailable' }));
  });
});

describe('messages, calls, GitHub, gateway, probes', () => {
  it('deliver() sends nothing on any channel', async () => {
    const { deliver } = await import('@/lib/comms/delivery');
    for (const channel of ['EMAIL', 'SMS', 'WHATSAPP', 'TELEGRAM', 'PHONE_CALL'] as const) {
      expect(await deliver({ userId: 'u1', to: 'a@b.c', body: 'x', channel })).toEqual({ sent: false, channel, reason: 'local_only' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('GitHub issue creation is refused', async () => {
    const { createIssue } = await import('@/lib/change-requests/github');
    const r = await createIssue({ title: 't', body: 'b' }, { WHINK_LOCAL_ONLY: 'true', CHANGE_REQUEST_GITHUB_REPO: 'o/r', CHANGE_REQUEST_GITHUB_TOKEN: 'x' });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('the gateway endpoint must be loopback', async () => {
    vi.stubEnv('OPENCLAW_URL', 'https://gateway.example.com');
    const c = await import('@/lib/openclaw-client');
    await expect(c.listOpenClawTools()).rejects.toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('connectivity probes to a cloud provider are not sent', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    vi.doMock('@/lib/db', () => ({ prisma: {} }));
    const offline = await import('@/lib/offline');
    offline.__clearProbeCache();
    await offline.connectivityMode(Date.now());
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('web_search and web_fetch are denied by the registry and their handlers refuse too', async () => {
    vi.doMock('@/lib/db', () => ({ prisma: {} }));
    vi.doMock('@/lib/permission-engine', async () => ({ ...(await vi.importActual<any>('@/lib/permission-engine')), checkPermission: vi.fn().mockResolvedValue({ allowed: true, method: 'auto' }), checkApprovedAction: vi.fn() }));
    vi.doMock('@/lib/approvals', () => ({ createApproval: vi.fn() }));
    vi.doMock('@/lib/memory-engine', () => ({ writeMemory: vi.fn(), correctMemory: vi.fn(), searchMemory: vi.fn() }));
    vi.doMock('@/lib/openclaw-client', () => ({ isGatewayConfigured: () => false, listOpenClawTools: vi.fn(), callOpenClawTool: vi.fn() }));
    const { executeTool } = await import('@/lib/tool-registry');
    for (const t of ['web_search', 'web_fetch']) {
      const r = await executeTool('u1', t, { query: 'q', url: 'https://example.com' });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/Local-Only/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
