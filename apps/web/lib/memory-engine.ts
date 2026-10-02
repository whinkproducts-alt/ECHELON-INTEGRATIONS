import { prisma } from '@/lib/db';
import { generateEmbedding } from '@/lib/embedding-service';


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
    case 'episodic': {
      const episodeRow = await prisma.memoryEpisode.create({
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
      // Fire-and-forget embedding update
      generateEmbedding(statement).then(async (vec) => {
        if (!vec) return;
        await prisma.$executeRawUnsafe(
          `UPDATE memory_episodes SET embedding = $1::vector WHERE id = $2`,
          `[${vec.join(',')}]`,
          episodeRow.id
        );
      }).catch(() => {/* non-blocking */});
      return episodeRow;
    }

    case 'semantic': {
      const semanticRow = await prisma.memorySemantic.create({
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
      // Fire-and-forget embedding update
      generateEmbedding(statement).then(async (vec) => {
        if (!vec) return;
        await prisma.$executeRawUnsafe(
          `UPDATE memory_semantic SET embedding = $1::vector WHERE id = $2`,
          `[${vec.join(',')}]`,
          semanticRow.id
        );
      }).catch(() => {/* non-blocking */});
      return semanticRow;
    }

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
  // Attempt vector search first; fall back to SQL LIKE
  const queryVec = await generateEmbedding(query);

  let semantics: any[];
  let episodes: any[];

  if (queryVec) {
    const vecLiteral = `[${queryVec.join(',')}]`;

    // Cosine distance (<=>). Lower = more similar. Scoped by userId (tenant isolation).
    // Two separate parameterized queries to avoid string interpolation of projectId.
    const semanticRows = projectId
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT *, (embedding <=> $1::vector) AS distance
           FROM memory_semantic
           WHERE "userId" = $2 AND "projectId" = $3
             AND "supersededBy" IS NULL AND embedding IS NOT NULL
           ORDER BY distance LIMIT $4`,
          vecLiteral, userId, projectId, limit
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT *, (embedding <=> $1::vector) AS distance
           FROM memory_semantic
           WHERE "userId" = $2
             AND "supersededBy" IS NULL AND embedding IS NOT NULL
           ORDER BY distance LIMIT $3`,
          vecLiteral, userId, limit
        );

    const episodeRows = projectId
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT *, (embedding <=> $1::vector) AS distance
           FROM memory_episodes
           WHERE "userId" = $2 AND "projectId" = $3
             AND "supersededBy" IS NULL AND embedding IS NOT NULL
           ORDER BY distance LIMIT $4`,
          vecLiteral, userId, projectId, limit
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT *, (embedding <=> $1::vector) AS distance
           FROM memory_episodes
           WHERE "userId" = $2
             AND "supersededBy" IS NULL AND embedding IS NOT NULL
           ORDER BY distance LIMIT $3`,
          vecLiteral, userId, limit
        );

    // If no embedded rows exist yet, fall back to LIKE
    if (semanticRows.length === 0 && episodeRows.length === 0) {
      semantics = await prisma.memorySemantic.findMany({
        where: { userId, supersededBy: null, statement: { contains: query }, ...(projectId ? { projectId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      episodes = await prisma.memoryEpisode.findMany({
        where: { userId, supersededBy: null, summary: { contains: query }, ...(projectId ? { projectId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    } else {
      semantics = semanticRows;
      episodes = episodeRows;
    }
  } else {
    // Embedding unavailable — use SQL LIKE
    semantics = await prisma.memorySemantic.findMany({
      where: {
        userId,
        supersededBy: null,
        statement: { contains: query },
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    episodes = await prisma.memoryEpisode.findMany({
      where: {
        userId,
        supersededBy: null,
        summary: { contains: query },
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

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
