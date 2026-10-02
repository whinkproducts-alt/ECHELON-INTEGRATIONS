import { prisma } from '@/lib/db';


export interface MemoryWriteInput {
  userId: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'hypothesis';
  statement: string;
  projectId?: string | null;
  source: string;
  sourceId?: string;
  confidence?: number;
  importance?: number;
  eventType?: string;
  epistemicStatus?: string;
  mambaMode?: string;
  rationale?: string;
  entities?: string[];
}

export async function writeMemory(input: MemoryWriteInput) {
  const {
    userId, type, statement, projectId, source, sourceId,
    confidence, importance, eventType, epistemicStatus,
    mambaMode, rationale, entities,
  } = input;

  switch (type) {
    case 'episodic':
      return prisma.memoryEpisode.create({
        data: {
          userId,
          projectId: projectId ?? null,
          eventType: eventType ?? 'observation',
          summary: statement,
          source,
          confidence: confidence ?? 0.8,
          importance: importance ?? 0.5,
          entities: entities ? JSON.stringify(entities) : null,
        },
      });

    case 'semantic':
      return prisma.memorySemantic.create({
        data: {
          userId,
          projectId: projectId ?? null,
          statement,
          sourceType: source,
          sourceId: sourceId ?? null,
          confidence: confidence ?? 0.8,
          epistemicStatus: epistemicStatus ?? 'KNOWN',
        },
      });

    case 'procedural':
      return prisma.memoryProcedural.create({
        data: {
          userId,
          category: eventType ?? 'general',
          description: statement,
          confidence: confidence ?? 0.9,
        },
      });

    case 'hypothesis':
      // Enforce MAMBA Memory Firewall: max confidence 0.4
      const cappedConfidence = Math.min(confidence ?? 0.3, 0.4);
      return prisma.hypothesis.create({
        data: {
          userId,
          projectId: projectId ?? null,
          statement,
          epistemicStatus: 'hypothesis',
          confidence: cappedConfidence,
          source: source ?? 'MAMBA',
          mambaMode: mambaMode ?? null,
          rationale: rationale ?? null,
        },
      });

    default:
      throw new Error(`Unknown memory type: ${type}`);
  }
}

export async function correctMemory(
  userId: string,
  oldStatement: string,
  newStatement: string,
  projectId?: string | null
) {
  // Find and supersede old semantic memories matching the old statement
  const oldMemories = await prisma.memorySemantic.findMany({
    where: {
      userId,
      statement: { contains: oldStatement },
      supersededBy: null,
      ...(projectId ? { projectId } : {}),
    },
  });

  // Create new memory
  const newMemory = await prisma.memorySemantic.create({
    data: {
      userId,
      projectId: projectId ?? null,
      statement: newStatement,
      sourceType: 'correction',
      confidence: 0.95,
      epistemicStatus: 'KNOWN',
    },
  });

  // Mark old memories as superseded
  for (const old of oldMemories) {
    await prisma.memorySemantic.update({
      where: { id: old.id },
      data: { supersededBy: newMemory.id },
    });
  }

  // Also log the correction as episodic memory
  await prisma.memoryEpisode.create({
    data: {
      userId,
      projectId: projectId ?? null,
      eventType: 'correction',
      summary: `Corrected: "${oldStatement}" → "${newStatement}"`,
      source: 'user',
      confidence: 0.95,
      importance: 0.7,
    },
  });

  return { superseded: oldMemories.length, newMemory };
}

export async function searchMemory(
  userId: string,
  query: string,
  projectId?: string | null,
  limit: number = 10
) {
  // Text-based search (pgvector similarity search is a Phase 2 enhancement)
  const semantics = await prisma.memorySemantic.findMany({
    where: {
      userId,
      supersededBy: null,
      statement: { contains: query },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const episodes = await prisma.memoryEpisode.findMany({
    where: {
      userId,
      supersededBy: null,
      summary: { contains: query },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const hypotheses = await prisma.hypothesis.findMany({
    where: {
      userId,
      supersededBy: null,
      statement: { contains: query },
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return { semantics, episodes, hypotheses };
}
