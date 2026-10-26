export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { exportMarkdown } from '@/lib/change-requests/service';

type Ctx = { params: Promise<{ id: string }> };

/** Markdown for the owner's own browser, to paste into a Claude Code session. Not sent anywhere. */
export async function GET(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  const md = await exportMarkdown(a.userId, id);
  if (md === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new Response(md, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="change-request-${id.replace(/[^A-Za-z0-9_-]/g, '').substring(0, 40)}.md"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
