export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const scenarios = await prisma.evaluationScenario.findMany({
    include: { runs: { orderBy: { executedAt: 'desc' }, take: 1 } },
  });
  return NextResponse.json(scenarios);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const run = await prisma.evaluationRun.create({
    data: {
      scenarioId: body.scenarioId,
      userId: session.user.id,
      result: body.result ?? 'PENDING',
      score: body.score ?? null,
      details: body.details ? JSON.stringify(body.details) : null,
    },
  });
  return NextResponse.json(run);
}
