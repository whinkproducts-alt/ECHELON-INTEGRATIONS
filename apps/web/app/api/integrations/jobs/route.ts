export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { lockdownResponse } from '@/lib/safety/lockdown-http';
import { requireOwner, errorResponse } from '@/lib/capability/api';
import { readJsonBody } from '@/lib/api-helpers';
import { enqueueCapabilityJob, getCapabilityJob } from '@/lib/worker/capability-execution';
export async function POST(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const locked = await lockdownResponse(who.userId, 'capability_job_enqueue');
  if (locked) return locked;
  const parsed = await readJsonBody(req);
  if ('response' in parsed) return parsed.response;
  try { return NextResponse.json({ job: await enqueueCapabilityJob(who.userId, parsed.body) }, { status: 202 }); }
  catch (e) { return errorResponse(e); }
}
export async function GET(req: Request) {
  const who = await requireOwner();
  if ('response' in who) return who.response;
  const id = new URL(req.url).searchParams.get('id');
  if (!id || id.length > 160) return NextResponse.json({ error: 'Job id required' }, { status: 400 });
  try {
    const job = await getCapabilityJob(who.userId, id);
    return job ? NextResponse.json({ job }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (e) { return errorResponse(e); }
}
