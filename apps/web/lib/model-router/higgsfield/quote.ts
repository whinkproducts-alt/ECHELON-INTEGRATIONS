import { createHash } from 'crypto';
import { canonicalJson } from '@/lib/canonical-json';
import { z } from 'zod';
import { mediaInputSchema, providerRequest, type MediaInput } from './schema';
export const quoteReceiptSchema = z.object({
  costBasis: z.literal('provider_estimate_not_final_invoice'),
  usd: z.string(), micros: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  quotedAt: z.string().datetime(), requestHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const generationInputSchema = mediaInputSchema.extend({
  quoteApprovalId: z.string().min(1).max(160),
  quote: quoteReceiptSchema,
  request: z.object({ model: z.string(), body: z.record(z.string(), z.unknown()) }).strict(),
}).strict();
/** Decimal arithmetic; round fractional micro-dollars up rather than understating liability. */
export function usdToMicros(usd: string): number {
  if (!/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,12})?$/.test(usd)) throw new Error('INVALID_PROVIDER_PRICE');
  const [whole, fraction = ''] = usd.split('.');
  const micros = BigInt(whole) * 1_000_000n + BigInt((fraction + '000000').slice(0, 6)) + (/[^0]/.test(fraction.slice(6)) ? 1n : 0n);
  if (micros > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INVALID_PROVIDER_PRICE');
  return Number(micros);
}
export function mediaRequestHash(input: MediaInput) {
  return createHash('sha256').update(canonicalJson(providerRequest(input))).digest('hex');
}
export function assertFreshQuote(input: MediaInput, quote: z.infer<typeof quoteReceiptSchema>, now = Date.now()) {
  const age = now - Date.parse(quote.quotedAt);
  if (!Number.isFinite(age) || age < 0 || age > 5 * 60_000) throw new Error('MEDIA_QUOTE_EXPIRED');
  if (quote.requestHash !== mediaRequestHash(input) || quote.micros !== usdToMicros(quote.usd)) throw new Error('MEDIA_QUOTE_MISMATCH');
}
