import { NextResponse } from 'next/server';
import { requireMarcusAuth } from '@/lib/capability/hosts';
import { MARCUS_DASHBOARDS, readMarcusDashboard, type MarcusDashboardId } from '@/lib/marcus/dashboards';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireMarcusAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  if (!MARCUS_DASHBOARDS.some((item) => item.id === id)) return NextResponse.json({ error: 'Dashboard not found' }, { status: 404 });
  try {
    return NextResponse.json(await readMarcusDashboard(id as MarcusDashboardId));
  } catch (error) {
    if (error instanceof Error && error.message === 'owner_not_configured') return NextResponse.json({ error: 'Owner account is not configured' }, { status: 503 });
    return NextResponse.json({ error: 'Dashboard unavailable' }, { status: 503 });
  }
}
