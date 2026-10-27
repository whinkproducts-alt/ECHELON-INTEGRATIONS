export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUserId } from '@/lib/api-helpers';
import { limitOr429 } from '@/lib/rate-limit';
import { rosterStats } from '@/lib/worker/roster';

/** Own-scope worker facts. No error text, no worker ids, no secrets. */
export async function GET() {
  const a = await requireUserId();
  if ('response' in a) return a.response;
  const limited = await limitOr429('recommendations', a.userId);
  if (limited) return limited;
  const [hb, jobs] = await Promise.all([
    prisma.agentHeartbeat.findFirst({ orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }),
    prisma.agentJob.findMany({
      where: { userId: a.userId }, orderBy: { jobKey: 'asc' }, take: 100,
      select: { jobKey: true, lastRunAt: true, lastStatus: true, nextRunAt: true, runs: true },
    }),
  ]);
  const now = Date.now();
  const stats = rosterStats();
  return NextResponse.json({
    enabled: process.env.WORKER_ENABLED === 'true',
    heartbeatAgeSeconds: hb ? Math.max(0, Math.round((now - hb.lastSeenAt.getTime()) / 1000)) : null,
    rosterSize: stats.size,
    enabledCount: stats.enabled,
    jobs: jobs.map((j: { jobKey: string; lastRunAt: Date | null; lastStatus: string | null; nextRunAt: Date; runs: number }) => ({
      jobKey: j.jobKey, lastRunAt: j.lastRunAt, lastStatus: j.lastStatus, nextRunAt: j.nextRunAt, runs: j.runs,
    })),
  });
}
