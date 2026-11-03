export const dynamic = 'force-dynamic';
// R04: create or update a saved model priority profile ({ name, choices: [first, second?, third?], activate? }).
import { NextResponse } from 'next/server';
import { requireUserId, readJsonBody } from '@/lib/api-helpers';
import { listProfiles, saveProfile } from '@/lib/model-router/priority';
import { limitOr429 } from '@/lib/rate-limit';

export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  return NextResponse.json({ profiles: await listProfiles(a.userId) });
}

export async function POST(req: Request) {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('model_profiles', a.userId);
  if (limited) return limited;
  const b = await readJsonBody(req, 4 * 1024);
  if ('response' in b) return b.response;
  const body = (b.body ?? {}) as { name?: unknown; choices?: unknown; activate?: unknown };
  const res = await saveProfile(a.userId, { name: body.name, choices: body.choices, activate: body.activate === true });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ profile: res.profile }, { status: 201 });
}
