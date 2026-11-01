export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { correctMemory } from '@/lib/memory-engine';
import { assertOwnedProject, hasProjectId } from '@/lib/project-access';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  let projectId: string | null = null;
  if (hasProjectId(body?.projectId)) {
    projectId = await assertOwnedProject(session.user.id, body.projectId);
    if (!projectId) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  const result = await correctMemory(session.user.id, body.oldStatement, body.newStatement, projectId);
  return NextResponse.json(result);
}
