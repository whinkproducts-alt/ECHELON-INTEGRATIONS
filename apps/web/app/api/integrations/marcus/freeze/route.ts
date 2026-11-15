import { NextResponse } from 'next/server';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { resolveMarcusOwner, setMarcusFreeze } from '@/lib/marcus/freeze';

export async function POST(req: Request) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const owner = await resolveMarcusOwner();
  if (!owner) return NextResponse.json({ error: 'Owner account is not configured (WHINK_OWNER_EMAILS)' }, { status: 503 });
  const taskIds = await setMarcusFreeze(owner.id, true);
  return NextResponse.json({ frozen: taskIds.length, taskIds });
}
