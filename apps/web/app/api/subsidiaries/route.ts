export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/api-helpers';
import { getSubsidiaries } from '@/lib/subsidiaries';
import { listAccessibleProjects, statsForProjects } from '@/lib/project-cards';

type Next = { title: string; dueDate: string | null; projectId: string; projectName: string };

function earlier(a: Next | null, b: Next): Next {
  if (!a) return b;
  if (a.dueDate === null) return b.dueDate !== null ? b : a;
  if (b.dueDate === null) return a;
  return b.dueDate < a.dueDate ? b : a;
}

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const projects = await listAccessibleProjects(a.userId);
  const stats = await statsForProjects(projects.map((p: { id: string }) => p.id));

  const bucket = () => ({ total: 0, active: 0, openTasks: 0, openRisks: 0, next: null as Next | null });
  const buckets = new Map<string, ReturnType<typeof bucket>>();
  for (const s of getSubsidiaries()) buckets.set(s.id, bucket());
  const unassigned = bucket();

  for (const p of projects as Array<{ id: string; name: string; status: string; subsidiary: string | null }>) {
    const b = (p.subsidiary ? buckets.get(p.subsidiary) : undefined) ?? unassigned;
    const st = stats.get(p.id);
    b.total += 1;
    if (p.status === 'ACTIVE') b.active += 1;
    if (st) {
      b.openTasks += st.tasksTotal - st.tasksDone;
      b.openRisks += st.openRisks;
      if (st.nextMilestone) b.next = earlier(b.next, { ...st.nextMilestone, projectId: p.id, projectName: p.name });
    }
  }

  return NextResponse.json({
    subsidiaries: getSubsidiaries().map((s) => {
      const b = buckets.get(s.id)!;
      return {
        id: s.id,
        name: s.name,
        logo: s.logo,
        counts: { total: b.total, active: b.active },
        openTasks: b.openTasks,
        openRisks: b.openRisks,
        nextMilestone: b.next,
      };
    }),
    unassigned: { total: unassigned.total, active: unassigned.active },
  });
}
