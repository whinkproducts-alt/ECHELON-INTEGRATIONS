import { prisma } from '@/lib/db';
import { auth } from '@/auth';

export interface Idea {
  id: string;
  title: string;
  body: string;
  source: 'founder' | 'recommendation';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  privacyScope: 'private' | 'shared';
}

export async function listIdeas(userId: string, scope: 'private' | 'shared' = 'private'): Promise<Idea[]> {
  const ideas = await prisma.founderIdea.findMany({
    where: { userId, privacyScope: scope, archived: false },
    orderBy: { updatedAt: 'desc' },
  });
  return ideas.map(i => ({
    ...i,
    source: i.source as 'founder' | 'recommendation',
    privacyScope: i.privacyScope as 'private' | 'shared',
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));
}

export async function createIdea(userId: string, input: { title: string; body: string; privacyScope: 'private' | 'shared' }): Promise<Idea> {
  const idea = await prisma.founderIdea.create({
    data: {
      userId,
      title: input.title,
      body: input.body,
      source: 'founder',
      privacyScope: input.privacyScope,
      archived: false,
    },
  });
  return {
    ...idea,
    source: idea.source as 'founder' | 'recommendation',
    privacyScope: idea.privacyScope as 'private' | 'shared',
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
  };
}

export async function updateIdea(userId: string, id: string, input: { title: string; body: string }): Promise<Idea | null> {
  const idea = await prisma.founderIdea.updateMany({
    where: { id, userId },
    data: { title: input.title, body: input.body, updatedAt: new Date() },
  });
  if (idea.count === 0) return null;
  const updated = await prisma.founderIdea.findFirst({ where: { id, userId } });
  if (!updated) return null;
  return {
    ...updated,
    source: updated.source as 'founder' | 'recommendation',
    privacyScope: updated.privacyScope as 'private' | 'shared',
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function archiveIdea(userId: string, id: string): Promise<boolean> {
  const result = await prisma.founderIdea.updateMany({
    where: { id, userId },
    data: { archived: true, updatedAt: new Date() },
  });
  return result.count === 1;
}

export async function listRecommendations(userId: string): Promise<Idea[]> {
  const ideas = await prisma.founderIdea.findMany({
    where: { userId, source: 'recommendation', archived: false },
    orderBy: { updatedAt: 'desc' },
  });
  return ideas.map(i => ({
    ...i,
    source: i.source as 'founder' | 'recommendation',
    privacyScope: i.privacyScope as 'private' | 'shared',
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));
}