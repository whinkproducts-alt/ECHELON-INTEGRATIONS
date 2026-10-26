export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { limitOr429 } from '@/lib/rate-limit';
import { APPROVAL_KINDS, APPROVAL_STATUSES, decodeCursor, listApprovalHistory } from '@/lib/ledger-search';

const isoDate = z.string().max(40).refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date').transform((v) => new Date(v));

const Query = z.object({
  status: z.enum(APPROVAL_STATUSES).optional(),
  category: z.enum(['money', 'proprietary']).optional(),
  kind: z.enum(APPROVAL_KINDS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

/** The caller's own approval requests in every state. Read only. */
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await limitOr429('read', userId);
  if (limited) return limited;

  const raw = Object.fromEntries(new URL(req.url).searchParams.entries());
  for (const k of Object.keys(raw)) if (raw[k] === '') delete raw[k];
  const parsed = Query.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
  const { cursor: rawCursor, ...rest } = parsed.data;
  const cursor = rawCursor ? decodeCursor(rawCursor) : null;
  if (rawCursor && !cursor) return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });

  const { items, nextCursor } = await listApprovalHistory(userId, { ...rest, cursor });
  return NextResponse.json({ items, nextCursor });
}
