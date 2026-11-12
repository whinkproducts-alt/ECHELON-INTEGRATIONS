import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), reserve: vi.fn(), hold: vi.fn(), release: vi.fn(), locked: vi.fn(), lock: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ $queryRaw: mocks.lock, usageEvent: { updateMany: mocks.update } }), approvalRequest: { findFirst: mocks.find }, usageEvent: { updateMany: mocks.update } } }));
vi.mock('@/lib/model-router/admission', () => ({ reserveDispatch: mocks.reserve, holdDispatch: mocks.hold, releaseDispatch: mocks.release }));
vi.mock('@/lib/safety/lockdown', () => ({ isLockedDown: mocks.locked }));
import { dispatchMedia, mediaStatus, prepareMediaGeneration, quoteMedia } from '@/lib/model-router/higgsfield/dispatch';
import { assertFreshQuote, mediaRequestHash, usdToMicros } from '@/lib/model-router/higgsfield/quote';
import { providerRequest } from '@/lib/model-router/higgsfield/schema';
import { approvalContentHash } from '@/lib/canonical-json';
const input = { kind: 'image' as const, prompt: 'a scene' };
function executed(tool: string, params: unknown, data: unknown) {
  return { id: 'q1', userId: 'account', kind: 'tool_call', tool, status: 'EXECUTED', params, contentHash: approvalContentHash({ kind: 'tool_call', tool, params }),
    decidedAt: new Date(), expiresAt: new Date(Date.now() + 30000), executedAt: new Date(), result: { success: true, data } };
}
const receipt = () => ({ costBasis: 'provider_estimate_not_final_invoice' as const, usd: '0.094', micros: 94000, quotedAt: new Date().toISOString(), requestHash: mediaRequestHash(input) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('HIGGSFIELD_ENABLED', 'true'); vi.stubEnv('HIGGSFIELD_ACCOUNT_USER_ID', 'account');
  vi.stubEnv('HIGGSFIELD_KEY_ID', 'test-id'); vi.stubEnv('HIGGSFIELD_KEY_SECRET', 'test-secret');
  mocks.locked.mockResolvedValue(false); mocks.lock.mockResolvedValue([{ id: 'account' }]); mocks.update.mockResolvedValue({ count: 1 }); mocks.reserve.mockResolvedValue({});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('authoritative media quote and dispatch', () => {
  it('uses decimal micro-USD arithmetic, rounds up and rejects unknown/negative/overflow prices', () => {
    expect(usdToMicros('0.094')).toBe(94000); expect(usdToMicros('0.0000001')).toBe(1); expect(usdToMicros('0')).toBe(0);
    for (const value of ['NaN', '-1', '1e2', '1000000000', '']) expect(() => usdToMicros(value)).toThrow();
  });
  it('estimates the identical documented request without a generation call', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ usd: '0.094' }));
    expect(await quoteMedia('account', input)).toMatchObject({ usd: '0.094', micros: 94000, requestHash: mediaRequestHash(input) });
    expect(fetch.mock.calls[0][0]).toBe('https://api.higgsfield.ai/estimate/alibaba/qwen-image-3/text-to-image');
    expect(mocks.reserve).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('reads only account-scoped executed quote approvals and refuses mutation/expiry', async () => {
    const quote = receipt(); mocks.find.mockResolvedValue(executed('media_quote', input, quote));
    expect(await prepareMediaGeneration('account', { quoteApprovalId: 'q1' })).toEqual({ ...input, quoteApprovalId: 'q1', quote, request: providerRequest(input) });
    expect(mocks.find).toHaveBeenCalledWith({ where: { id: 'q1', userId: 'account', kind: 'tool_call', tool: 'media_quote', status: 'EXECUTED' } });
    expect(() => assertFreshQuote({ ...input, prompt: 'changed' }, quote)).toThrow('MEDIA_QUOTE_MISMATCH');
    expect(() => assertFreshQuote(input, { ...quote, quotedAt: new Date(Date.now() - 300001).toISOString() })).toThrow('MEDIA_QUOTE_EXPIRED');
    mocks.find.mockResolvedValue(null); await expect(prepareMediaGeneration('other', { quoteApprovalId: 'q1' })).rejects.toThrow('MEDIA_APPROVAL_NOT_FOUND');
  });
  it('reserves account spend before submit and uses a quote-bound idempotency key', async () => {
    const quote = receipt(); mocks.find.mockResolvedValue(executed('media_quote', input, quote));
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ usd: '0.094' })).mockResolvedValueOnce(Response.json({ request_id: 'r1', status: 'queued' }));
    expect(await dispatchMedia('account', { ...input, quoteApprovalId: 'q1', quote, request: providerRequest(input) })).toEqual({ requestId: 'r1', attemptKey: 'media:q1', quotedMicros: 94000, kind: 'image' });
    expect(mocks.reserve).toHaveBeenCalledWith(expect.objectContaining({ userId: 'account', attemptKey: 'media:q1', priceKnown: true, reservedMicros: 94000, costClass: 'metered' }));
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[1]);
    expect(fetch.mock.calls[1][1]).toMatchObject({ headers: { 'Idempotency-Key': 'media:q1' } });
  });
  it('rejects increased provider price without reserving or generating', async () => {
    const quote = receipt(); mocks.find.mockResolvedValue(executed('media_quote', input, quote));
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ usd: '0.095' }));
    await expect(dispatchMedia('account', { ...input, quoteApprovalId: 'q1', quote, request: providerRequest(input) })).rejects.toThrow('MEDIA_PRICE_INCREASED');
    expect(fetch).toHaveBeenCalledTimes(1); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it('does not generate when account admission rejects a cap or duplicate quote attempt', async () => {
    const quote = receipt(); mocks.find.mockResolvedValue(executed('media_quote', input, quote));
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ usd: '0.094' }));
    mocks.reserve.mockRejectedValue(new Error('ATTEMPT_CONSUMED'));
    await expect(dispatchMedia('account', { ...input, quoteApprovalId: 'q1', quote, request: providerRequest(input) })).rejects.toThrow('ATTEMPT_CONSUMED');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('holds uncertain submissions, never retries, and does not erase budget liability', async () => {
    const quote = receipt(); mocks.find.mockResolvedValue(executed('media_quote', input, quote));
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ usd: '0.094' })).mockRejectedValueOnce(new Error('lost response'));
    await expect(dispatchMedia('account', { ...input, quoteApprovalId: 'q1', quote, request: providerRequest(input) })).rejects.toThrow('HIGGSFIELD_TRANSPORT_FAILED');
    expect(fetch).toHaveBeenCalledTimes(2); expect(mocks.hold).toHaveBeenCalledWith({ userId: 'account', attemptKey: 'media:q1', uncertainty: 'media_submission_unknown' });
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it.each(['completed', 'failed', 'nsfw', 'canceled'] as const)('polls only owned receipts and settles %s liability truthfully', async status => {
    mocks.find.mockResolvedValue(executed('media_generate', {}, { requestId: 'r1', attemptKey: 'media:q1', quotedMicros: 94000, kind: 'image' }));
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ request_id: 'r1', status }));
    expect(await mediaStatus('account', { generationApprovalId: 'g1' })).toMatchObject({ request_id: 'r1', status });
    expect(fetch.mock.calls[0][0]).toBe('https://api.higgsfield.ai/requests/r1/status');
    if (status !== 'completed') expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'account', attemptKey: 'media:q1', reservedMicros: 94000 }), data: expect.objectContaining(status === 'completed' ? { state: 'held', uncertainty: 'media_billing_pending' } : { costMicros: 0, state: 'settled', usageBasis: 'estimated', uncertainty: 'provider_policy_not_charged' }) }));
  });
  it('leaves in-progress liability reserved; refuses raw request IDs and unknown ownership', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch'); mocks.find.mockResolvedValue(null);
    await expect(mediaStatus('account', { generationApprovalId: 'other' })).rejects.toThrow();
    await expect(mediaStatus('account', { requestId: 'r1' })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
