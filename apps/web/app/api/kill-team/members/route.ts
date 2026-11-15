export const dynamic = 'force-dynamic';
// Founder-only roster. Read, add. A member grants no permission; it is a name, a role and a brief.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { isOwnerEmail } from '@/lib/owner';
import { readJsonBody } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { createMember, listMembers } from '@/lib/kill-team';
import { recordActionSafe } from '@/lib/ledger';

const Body = z.object({ name: z.string().min(1).max(60), role: z.string().min(1).max(120), handoff: z.string().max(160).optional(), brief: z.string().max(1500).optional() });

async function founder() {
  const s = await auth();
  if (!s?.user?.id) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!isOwnerEmail(s.user.email)) return { response: NextResponse.json({ error: 'Founder access required' }, { status: 403 }) };
  return { userId: s.user.id };
}

export async function GET() {
  const f = await founder();
  if ('response' in f) return f.response;
  return NextResponse.json({ members: await listMembers(f.userId) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const f = await founder();
  if ('response' in f) return f.response;
  const limited = await limitOr429('read', f.userId);
  if (limited) return limited;
  const b = await readJsonBody(req, 8 * 1024);
  if ('response' in b) return b.response;
  const parsed = Body.safeParse(b.body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const r = await createMember(f.userId, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  await recordActionSafe({ userId: f.userId, initiator: 'user', persona: 'WHINK', tool: 'kill_team_member', action: 'kill_team_member_created', permissionClass: 'A', status: 'VALIDATED', inputSummary: `slug ${r.member.slug}` });
  return NextResponse.json({ member: r.member }, { status: 201 });
}
