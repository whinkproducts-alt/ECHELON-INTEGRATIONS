export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { searchMemory } from '@/lib/memory-engine';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') ?? '';
  const projectId = searchParams.get('projectId');
  const result = await searchMemory(session.user.id, query, projectId);
  return NextResponse.json(result);
}
