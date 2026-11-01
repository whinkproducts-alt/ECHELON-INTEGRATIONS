export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getOrgKit } from '@/lib/agent-loader';
import { requireOwner } from '@/lib/capability/api';

/** Roster search for the grant form: canonical ids only, read from the org-kit (never written). */
export async function GET(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ agents: [], teams: [] });
  const kit = await getOrgKit();
  const agents = kit.agents
    .filter((a) => a.agent_id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.title.toLowerCase().includes(q))
    .slice(0, 20).map((a) => ({ id: a.agent_id, name: a.name, title: a.title, state: a.state }));
  const teams = kit.teams
    .filter((t) => t.team_id.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    .slice(0, 20).map((t) => ({ id: t.team_id, name: t.name }));
  return NextResponse.json({ agents, teams });
}
