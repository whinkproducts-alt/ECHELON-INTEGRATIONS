import { NextResponse } from 'next/server';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { isMarcusFrozen, resolveMarcusOwner } from '@/lib/marcus/freeze';
import { resumeMarcusTask } from '@/lib/marcus/tasks';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const owner = await resolveMarcusOwner();
  if (!owner) return NextResponse.json({ error: 'Owner account is not configured (WHINK_OWNER_EMAILS)' }, { status: 503 });
  if (await isMarcusFrozen(owner.id)) return NextResponse.json({ error: 'Marcus tasks are frozen' }, { status: 503 });
  const r = await resumeMarcusTask(owner.id, (await params).id);
  return NextResponse.json(r.body, { status: r.status });
}
