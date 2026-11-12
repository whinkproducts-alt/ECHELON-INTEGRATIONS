/** Only registered governed tools call these operations. Routes never call the transport. */
import { prisma } from '@/lib/db';
import { approvalContentHash, canonicalJson } from '@/lib/canonical-json';
import { isLocalOnlyMode } from '@/lib/local-only';
import { isLockedDown } from '@/lib/safety/lockdown';
import { reserveDispatch, holdDispatch, releaseDispatch } from '../admission';
import { mediaConfig } from './config';
import { HiggsfieldClient } from './client';
import { mediaInputSchema, providerRequest } from './schema';
import { assertFreshQuote, generationInputSchema, mediaRequestHash, quoteReceiptSchema } from './quote';
import { z } from 'zod';
const idSchema = z.object({ quoteApprovalId: z.string().min(1).max(160) }).strict();
const statusInputSchema = z.object({ generationApprovalId: z.string().min(1).max(160) }).strict();
const generationReceiptSchema = z.object({ requestId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), attemptKey: z.string(), quotedMicros: z.number().int().nonnegative(), kind: z.enum(['image', 'video']) });
async function clientFor(userId: string) {
  const config = mediaConfig(userId);
  if (isLocalOnlyMode()) throw new Error('LOCAL_ONLY');
  if (await isLockedDown(userId)) throw new Error('LOCKDOWN');
  return new HiggsfieldClient(config);
}
async function executedApproval(userId: string, id: string, tool: string) {
  const row = await prisma.approvalRequest.findFirst({ where: { id, userId, kind: 'tool_call', tool, status: 'EXECUTED' } });
  if (!row || !row.executedAt || !row.decidedAt || row.decidedAt >= row.expiresAt) throw new Error('MEDIA_APPROVAL_NOT_FOUND');
  if (approvalContentHash({ kind: row.kind, tool: row.tool, params: row.params }) !== row.contentHash) throw new Error('MEDIA_APPROVAL_CHANGED');
  const result = row.result as { success?: boolean; data?: unknown } | null;
  if (!result?.success) throw new Error('MEDIA_APPROVAL_NOT_EXECUTED');
  return { row, data: result.data };
}
/** Canonical expansion happens before generation approval creation; callers never supply a price. */
export async function prepareMediaGeneration(userId: string, raw: unknown) {
  const { quoteApprovalId } = idSchema.parse(raw);
  const { row, data } = await executedApproval(userId, quoteApprovalId, 'media_quote');
  const input = mediaInputSchema.parse(row.params);
  const quote = quoteReceiptSchema.parse(data);
  assertFreshQuote(input, quote);
  return { ...input, quoteApprovalId, quote, request: providerRequest(input) };
}
/** Price lookup sends the exact prompt externally, so this is a protected egress tool, never automatic. */
export async function quoteMedia(userId: string, raw: unknown) {
  const input = mediaInputSchema.parse(raw);
  const client = await clientFor(userId);
  const estimate = await client.estimate(input);
  return { ...estimate, costBasis: 'provider_estimate_not_final_invoice' as const, quotedAt: new Date().toISOString(), requestHash: mediaRequestHash(input) };
}
export async function dispatchMedia(userId: string, raw: unknown) {
  const params = generationInputSchema.parse(raw);
  const expected = await prepareMediaGeneration(userId, { quoteApprovalId: params.quoteApprovalId });
  if (canonicalJson(params) !== canonicalJson(expected)) throw new Error('MEDIA_QUOTE_MISMATCH');
  const input = mediaInputSchema.parse({ kind: params.kind, prompt: params.prompt });
  const client = await clientFor(userId);
  // Approved scope explicitly includes re-estimation of this exact request. A higher price needs a fresh approval.
  const refreshed = await client.estimate(input);
  if (refreshed.micros > params.quote.micros) throw new Error('MEDIA_PRICE_INCREASED');
  const attemptKey = `media:${params.quoteApprovalId}`;
  await reserveDispatch({ userId, purpose: 'other', provider: 'higgsfield', model: providerRequest(input).model,
    attemptKey, costClass: 'metered', priceKnown: true, reservedMicros: refreshed.micros, reservedTokens: 0, inputChars: 0, maxTokens: 1, kind: 'media' });
  let externalAttemptStarted = false;
  try {
    // Re-check safety after reservation. An uncertain send is held forever until reconciled, never retried.
    await clientFor(userId);
    externalAttemptStarted = true;
    const result = await client.submit(input, attemptKey);
    return { requestId: result.request_id, attemptKey, quotedMicros: refreshed.micros, kind: input.kind };
  } catch (error) {
    if (externalAttemptStarted) await holdDispatch({ userId, attemptKey, uncertainty: 'media_submission_unknown' });
    else await releaseDispatch({ userId, attemptKey, externalAttemptStarted: false });
    throw error;
  }
}
/** Atomic, idempotent policy-based reconciliation; no provider invoice receipt is fabricated. */
async function settleMedia(userId: string, attemptKey: string, reservedMicros: number) {
  await prisma.$transaction(async tx => {
    // Same account lock as reserveDispatch: a liability cannot disappear between its aggregate reads.
    const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (rows.length !== 1) throw new Error('MISSING_ACCOUNT');
    await tx.usageEvent.updateMany({
      where: { userId, attemptKey, provider: 'higgsfield', kind: 'media', state: { in: ['reserved', 'held'] }, reservedMicros },
      data: { state: 'settled', usageBasis: 'estimated', reservedMicros: 0, reservedTokens: 0,
        costMicros: 0, estimatedMicros: null, tokensIn: 0, tokensOut: 0,
        priceKnown: true, settledAt: new Date(), uncertainty: 'provider_policy_not_charged' },
    });
  });
}
/** No arbitrary request IDs: ownership is proven from the successful, hash-locked generation receipt. */
export async function mediaStatus(userId: string, raw: unknown) {
  const { generationApprovalId } = statusInputSchema.parse(raw);
  const { data } = await executedApproval(userId, generationApprovalId, 'media_generate');
  const receipt = generationReceiptSchema.parse(data);
  const client = await clientFor(userId);
  const result = await client.status(receipt.requestId);
  if (result.request_id !== receipt.requestId) throw new Error('MEDIA_REQUEST_MISMATCH');
  if (result.status === 'completed') {
    // Status has no authoritative billed USD field. Keep the full reservation as liability until invoice reconciliation.
    await prisma.usageEvent.updateMany({
      where: { userId, attemptKey: receipt.attemptKey, provider: 'higgsfield', kind: 'media', state: 'reserved', reservedMicros: receipt.quotedMicros },
      data: { state: 'held', usageBasis: 'held', uncertainty: 'media_billing_pending' },
    });
  }
  if (['failed', 'nsfw', 'canceled'].includes(result.status)) await settleMedia(userId, receipt.attemptKey, receipt.quotedMicros);
  return { ...result, generationApprovalId, quotedMicros: receipt.quotedMicros, accounting: result.status === 'completed' ? 'billing_reconciliation_pending' : ['failed', 'nsfw', 'canceled'].includes(result.status) ? 'policy_not_charged' : 'reserved' };
}
