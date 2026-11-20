import { NextResponse } from 'next/server';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { MARCUS_DASHBOARDS } from '@/lib/marcus/dashboards';

export async function GET(req: Request) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ dashboards: MARCUS_DASHBOARDS });
}
