import { prisma } from '@/lib/db';

export interface Initiative {
  id: string;
  userId: string;
  title: string;
  objective: string;
  status: 'queued' | 'working' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled';
  recipient: string;
  progress: number;
  result?: unknown;
  sourceIdeaId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listInitiatives(userId: string): Promise<Initiative[]> {
  const initiatives = await prisma.initiative.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });
  return initiatives.map(i => ({
    ...i,
    status: i.status as Initiative['status'],
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));
}

export async function createInitiative(userId: string, input: { title: string; objective: string; recipient: string; sourceIdeaId?: string }): Promise<Initiative> {
  const initiative = await prisma.initiative.create({
    data: {
      userId,
      title: input.title,
      objective: input.objective,
      recipient: input.recipient,
      sourceIdeaId: input.sourceIdeaId || null,
      status: 'queued',
      progress: 0,
    },
  });
  return {
    ...initiative,
    status: initiative.status as Initiative['status'],
    createdAt: initiative.createdAt.toISOString(),
    updatedAt: initiative.updatedAt.toISOString(),
  };
}

export async function updateInitiativeProgress(userId: string, id: string, progress: number, status?: Initiative['status'], result?: unknown): Promise<Initiative | null> {
  const data: Record<string, unknown> = { progress, updatedAt: new Date() };
  if (status) data.status = status;
  if (result !== undefined) data.result = result;
  
  const updated = await prisma.initiative.updateMany({
    where: { id, userId },
    data,
  });
  if (updated.count === 0) return null;
  
  const initiative = await prisma.initiative.findFirst({ where: { id, userId } });
  if (!initiative) return null;
  
  return {
    ...initiative,
    status: initiative.status as Initiative['status'],
    createdAt: initiative.createdAt.toISOString(),
    updatedAt: initiative.updatedAt.toISOString(),
  };
}

export async function listSealedObjectives(userId: string) {
  const objectives = await prisma.sealedObjective.findMany({
    where: { userId, status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
  });
  return objectives.map(o => ({
    ...o,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    completedAt: o.completedAt?.toISOString() || null,
  }));
}