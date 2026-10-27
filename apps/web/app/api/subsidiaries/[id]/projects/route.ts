export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { getSubsidiary } from '@/lib/subsidiaries';
import { cardFor, listAccessibleProjects, statsForProjects } from '@/lib/project-cards';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const { id } = await params;
  const sub = id === 'unassigned' ? { id: 'unassigned', name: 'Unassigned' } : getSubsidiary(id);
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const projects = await listAccessibleProjects(a.userId, id);
  const stats = await statsForProjects(projects.map((p: { id: string }) => p.id));
  return NextResponse.json({
    subsidiary: { id: sub.id, name: sub.name },
    projects: projects.map((p: any) => cardFor(p, stats.get(p.id))),
  });
}
