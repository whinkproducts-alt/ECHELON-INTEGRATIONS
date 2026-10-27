export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { submit } from '@/lib/change-requests/service';

type Ctx = { params: Promise<{ id: string }> };

/**
 * PROTECTED (proprietary): creates an approval request showing the exact GitHub issue. Nothing is
 * sent until the owner approves that request id within 30 seconds.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('change_requests', a.userId);
  if (limited) return limited as NextResponse;
  const { id } = await params;
  const res = await submit(a.userId, id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (!res.githubConfigured) {
    return NextResponse.json({ status: 'AWAITING_APPROVAL', githubConfigured: false, message: res.message, exportUrl: res.exportUrl }, { status: 200 });
  }
  return NextResponse.json({ status: 'AWAITING_APPROVAL', approvalId: res.approval.id, approval: res.approval, githubConfigured: true }, { status: 202 });
}
