export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { mediaReadiness } from '@/lib/model-router/higgsfield/config';
import { mediaInputSchema } from '@/lib/model-router/higgsfield/schema';
import { executeTool } from '@/lib/tool-registry';
import { limitOr429 } from '@/lib/rate-limit';
import { z } from 'zod';
const generate = z.object({ action: z.literal('generate'), quoteApprovalId: z.string().min(1).max(160) }).strict();
const quote = mediaInputSchema.extend({ action: z.literal('quote') }).strict();
const status = z.object({ action: z.literal('status'), generationApprovalId: z.string().min(1).max(160) }).strict();
export async function GET() {
  const account = await requireUserId();
  if ('response' in account) return account.response;
  return NextResponse.json(mediaReadiness(account.userId), { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(req: Request) {
  const account = await requireUserId();
  if ('response' in account) return account.response;
  const body = await readJsonBody(req, 20 * 1024);
  if ('response' in body) return body.response;
  const parsed = z.discriminatedUnion('action', [generate, quote, status]).safeParse(body.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid media request. Supply an exact draft for quote, quote approval ID for generation, or generation approval ID for status.' }, { status: 400 });
  const limited = await limitOr429(parsed.data.action === 'status' ? 'read' : 'approvals', account.userId);
  if (limited) return limited;
  const input = parsed.data;
  const tool = input.action === 'quote' ? 'media_quote' : input.action === 'generate' ? 'media_generate' : 'media_status';
  const params = input.action === 'quote' ? { kind: input.kind, prompt: input.prompt } : input.action === 'generate' ? { quoteApprovalId: input.quoteApprovalId } : { generationApprovalId: input.generationApprovalId };
  const result = await executeTool(account.userId, tool, params, undefined, undefined, undefined, { initiator: 'user' });
  return NextResponse.json(result, { status: result.approvalRequired ? 202 : result.success ? 200 : 409, headers: { 'Cache-Control': 'no-store' } });
}
