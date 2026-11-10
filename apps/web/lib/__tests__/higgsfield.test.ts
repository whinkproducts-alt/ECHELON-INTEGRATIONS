import { describe, expect, it, vi } from 'vitest';
import { HiggsfieldClient } from '@/lib/model-router/higgsfield/client';
import { mediaConfig } from '@/lib/model-router/higgsfield/config';
import { mediaInputSchema } from '@/lib/model-router/higgsfield/schema';
import { classifyProtected } from '@/lib/protected-actions';
import { decideAdmission } from '@/lib/model-router/admission';
import { isAllowedInLocalOnly, LOCAL_ONLY_DENIED } from '@/lib/workspace-tools/local-only';
const credentials = { keyId: 'test-id', secret: 'test-secret' };
const env = { HIGGSFIELD_ENABLED: 'true', HIGGSFIELD_ACCOUNT_USER_ID: 'owner', HIGGSFIELD_KEY_ID: credentials.keyId, HIGGSFIELD_KEY_SECRET: credentials.secret };
describe('Higgsfield provider boundary', () => {
  it('is disabled by default and credentials are bound to one account', () => {
    expect(() => mediaConfig('owner', {})).toThrow('MEDIA_DISABLED');
    expect(() => mediaConfig('other', env)).toThrow('MEDIA_NOT_CONFIGURED');
    expect(mediaConfig('owner', env)).toEqual(credentials);
    expect(() => mediaConfig('owner', { ...env, HIGGSFIELD_KEY_SECRET: 'bad\nsecret' })).toThrow();
  });
  it('accepts exact bounded drafts, never arbitrary provider paths or upload URLs', () => {
    expect(mediaInputSchema.safeParse({ kind: 'image', prompt: 'scene', model: '../evil' }).success).toBe(false);
    expect(mediaInputSchema.safeParse({ kind: 'video', prompt: ' ' }).success).toBe(false);
    expect(mediaInputSchema.safeParse({ kind: 'image', prompt: 'scene', image_url: 'http://localhost' }).success).toBe(false);
  });
  it.each(['image', 'video'] as const)('submits documented fixed %s variant with exact auth and no redirect/retry', async kind => {
    const transport = vi.fn().mockResolvedValue(Response.json({ request_id: 'req-test', status: 'queued' }));
    const client = new HiggsfieldClient(credentials, transport);
    expect(await client.submit({ kind, prompt: 'a scene' }, 'attempt-0001')).toEqual({ request_id: 'req-test', status: 'queued' });
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(kind === 'image' ? 'https://api.higgsfield.ai/alibaba/qwen-image-3/text-to-image' : 'https://api.higgsfield.ai/bytedance/seedance-2.0/text-to-video');
    expect(init).toMatchObject({ redirect: 'error', headers: { Authorization: 'Key test-id:test-secret', 'Idempotency-Key': 'attempt-0001' } });
    expect(JSON.parse(init.body).prompt).toBe('a scene');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not trust provider-supplied status URLs or request path traversal', async () => {
    const transport = vi.fn().mockResolvedValue(Response.json({ request_id: 'req-test', status: 'completed', status_url: 'http://localhost', images: [{ url: 'https://cdn.example/out.png' }] }));
    const client = new HiggsfieldClient(credentials, transport);
    await expect(client.status('../secret')).rejects.toThrow('INVALID_REQUEST_ID');
    await client.status('req-test');
    expect(transport.mock.calls[0][0]).toBe('https://api.higgsfield.ai/requests/req-test/status');
  });
  it('redacts provider errors and never retries failed requests', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('test-secret and private prompt', { status: 401 }));
    await expect(new HiggsfieldClient(credentials, transport).submit({ kind: 'image', prompt: 'scene' }, 'attempt-0001')).rejects.toThrow(/^HIGGSFIELD_HTTP_401$/);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('paid generation is protected at Class C and denied in local-only mode', () => {
    expect(classifyProtected({ toolName: 'media_generate' })).toMatchObject({ protected: true, category: 'money' });
    expect(isAllowedInLocalOnly('media_generate')).toBe(false);
    expect(LOCAL_ONLY_DENIED.has('media_generate')).toBe(true);
  });
  it('unknown media pricing cannot pass account admission even with paid enabled and a cap', () => {
    expect(decideAdmission({ userId: 'owner', costClass: 'metered', paidAdmitted: true, priceKnown: false, spendCapMicros: 10_000_000,
      reservedTokens: 0, reservedMicros: 0, tokenUsed: 0, tokenReserved: 0, tokenLimit: null, tokenHardPct: 100,
      spendUsedMicros: 0, spendReservedMicros: 0, lockedDown: false, localOnly: false })).toEqual({ ok: false, code: 'UNKNOWN_PRICE' });
  });
});
