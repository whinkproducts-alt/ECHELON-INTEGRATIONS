import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requireUserId: vi.fn(), executeTool: vi.fn(), limit: vi.fn() }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/api-helpers', async () => ({ ...(await vi.importActual('@/lib/api-helpers')), requireUserId: mocks.requireUserId }));
vi.mock('@/lib/tool-registry', () => ({ executeTool: mocks.executeTool }));
vi.mock('@/lib/rate-limit', () => ({ limitOr429: mocks.limit }));
import { GET, POST } from '@/app/api/media/route';
import { NextResponse } from 'next/server';
beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllEnvs();
  mocks.requireUserId.mockResolvedValue({ userId: 'account' }); mocks.limit.mockResolvedValue(null);
});
const request = (body: unknown) => new Request('http://localhost/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
describe('media account API', () => {
  it('requires authentication before status or request access', async () => {
    mocks.requireUserId.mockResolvedValue({ response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) });
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ action: 'quote', kind: 'image', prompt: 'scene' }))).status).toBe(401);
    expect(mocks.executeTool).not.toHaveBeenCalled();
  });
  it('never serializes credentials; generation needs separate paid admission and cap', async () => {
    vi.stubEnv('HIGGSFIELD_ENABLED', 'true'); vi.stubEnv('HIGGSFIELD_ACCOUNT_USER_ID', 'account');
    vi.stubEnv('HIGGSFIELD_KEY_ID', 'private-id'); vi.stubEnv('HIGGSFIELD_KEY_SECRET', 'private-secret');
    const result = await (await GET()).json();
    expect(result).toMatchObject({ configured: true, quoteReady: true, generationReady: false, blocker: 'PAID_NOT_ADMITTED' });
    expect(JSON.stringify(result)).not.toContain('private-');
    vi.stubEnv('WHINK_PAID_MODELS_ENABLED', 'true'); vi.stubEnv('WHINK_MONTHLY_SPEND_MICROS', '1000000');
    expect(await (await GET()).json()).toMatchObject({ generationReady: true, blocker: null });
  });
  it('does not let a different account use configured server keys', async () => {
    vi.stubEnv('HIGGSFIELD_ENABLED', 'true'); vi.stubEnv('HIGGSFIELD_ACCOUNT_USER_ID', 'another-account');
    vi.stubEnv('HIGGSFIELD_KEY_ID', 'private-id'); vi.stubEnv('HIGGSFIELD_KEY_SECRET', 'private-secret');
    expect(await (await GET()).json()).toMatchObject({ configured: false, quoteReady: false });
  });
  it('rejects direct approvals, arbitrary prices, forged account IDs, paths and upload URLs', async () => {
    for (const extra of [{ approved: true }, { price: 0 }, { userId: 'victim' }, { baseUrl: 'https://evil.test' }, { url: 'https://example.com/file' }]) {
      expect((await POST(request({ action: 'quote', kind: 'image', prompt: 'scene', ...extra }))).status).toBe(400);
    }
    expect((await POST(request({ action: 'generate', quoteApprovalId: 'q', quote: { usd: '0' } }))).status).toBe(400);
    expect(mocks.executeTool).not.toHaveBeenCalled();
  });
  it.each([
    [{ action: 'quote', kind: 'image', prompt: 'scene' }, 'media_quote', { kind: 'image', prompt: 'scene' }],
    [{ action: 'generate', quoteApprovalId: 'q' }, 'media_generate', { quoteApprovalId: 'q' }],
    [{ action: 'status', generationApprovalId: 'g' }, 'media_status', { generationApprovalId: 'g' }],
  ])('uses governed tools for every operation', async (body, tool, params) => {
    mocks.executeTool.mockResolvedValue({ success: false, approvalRequired: { id: 'approval-1' } });
    expect((await POST(request(body))).status).toBe(202);
    expect(mocks.executeTool).toHaveBeenCalledWith('account', tool, params, undefined, undefined, undefined, { initiator: 'user' });
  });
});
