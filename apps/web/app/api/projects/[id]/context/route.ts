export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { assembleContext, formatContextForPrompt } from '@/lib/context-engine';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const context = await assembleContext(session.user.id, '', id);
  return NextResponse.json({ context, formatted: formatContextForPrompt(context) });
}
