export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { executeTool } from '@/lib/tool-registry';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const result = await executeTool(
    session.user.id,
    body.tool,
    body.params ?? {},
    body.persona,
    body.mambaMode
  );
  return NextResponse.json(result);
}
