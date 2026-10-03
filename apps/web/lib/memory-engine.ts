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
  // L3: Guard against accidental wipe from very short match strings
  if (oldStatement.trim().length < 10) {
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
    return { superseded: 0, newMemory };
  }

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

/**
 * Merge two ranked result lists using Reciprocal Rank Fusion.
 * score = 1/(60 + rank_a) + 1/(60 + rank_b)
 * Rows that appear in only one list get a rank of Infinity for the missing list.
 */
function rrfMerge(vectorRows: any[], fulltextRows: any[], limit: number): any[] {
  const scores = new Map<string, { row: any; score: number }>();

  vectorRows.forEach((row, i) => {
    const prev = scores.get(row.id);
    const add = 1 / (60 + i + 1);
    if (prev) {
      prev.score += add;
    } else {
      scores.set(row.id, { row, score: add });
    }
  });

  fulltextRows.forEach((row, i) => {
    const prev = scores.get(row.id);
    const add = 1 / (60 + i + 1);
    if (prev) {
      prev.score += add;
    } else {
      scores.set(row.id, { row, score: add });
    }
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => e.row);
}

export async function searchMemory(
  userId: string,
  query: string,
  projectId?: string | null,
  limit: number = 10
) {
  const queryVec = await generateEmbedding(query);

  let semantics: any[];
  let episodes: any[];

  if (queryVec) {
    const vecLiteral = `[${queryVec.join(',')}]`;

    // ── Vector search (cosine distance, lower = more similar) ───────────────
    const semanticVec = projectId
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

    const episodeVec = projectId
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

    // ── Full-text search (tsvector GIN index) ────────────────────────────────
    // L1: Use websearch_to_tsquery — safe with punctuation and arbitrary user input.
    // Wrapped in try/catch to fall back to vector-only results if full-text fails.
    let semanticFt: any[] = [];
    let episodeFt: any[] = [];
    try {
      semanticFt = projectId
        ? await prisma.$queryRawUnsafe<any[]>(
            `SELECT *, ts_rank(search_vec, websearch_to_tsquery('english', $1)) AS ft_rank
             FROM memory_semantic
             WHERE "userId" = $2 AND "projectId" = $3
               AND "supersededBy" IS NULL AND search_vec @@ websearch_to_tsquery('english', $4)
             ORDER BY ft_rank DESC LIMIT $5`,
            query, userId, projectId, query, limit
          )
        : await prisma.$queryRawUnsafe<any[]>(
            `SELECT *, ts_rank(search_vec, websearch_to_tsquery('english', $1)) AS ft_rank
             FROM memory_semantic
             WHERE "userId" = $2
               AND "supersededBy" IS NULL AND search_vec @@ websearch_to_tsquery('english', $3)
             ORDER BY ft_rank DESC LIMIT $4`,
            query, userId, query, limit
          );

      episodeFt = projectId
        ? await prisma.$queryRawUnsafe<any[]>(
            `SELECT *, ts_rank(search_vec, websearch_to_tsquery('english', $1)) AS ft_rank
             FROM memory_episodes
             WHERE "userId" = $2 AND "projectId" = $3
               AND "supersededBy" IS NULL AND search_vec @@ websearch_to_tsquery('english', $4)
             ORDER BY ft_rank DESC LIMIT $5`,
            query, userId, projectId, query, limit
          )
        : await prisma.$queryRawUnsafe<any[]>(
            `SELECT *, ts_rank(search_vec, websearch_to_tsquery('english', $1)) AS ft_rank
             FROM memory_episodes
             WHERE "userId" = $2
               AND "supersededBy" IS NULL AND search_vec @@ websearch_to_tsquery('english', $3)
             ORDER BY ft_rank DESC LIMIT $4`,
            query, userId, query, limit
          );
    } catch {
      // Full-text query failed (e.g. unsupported syntax) — fall back to vector-only
      semanticFt = [];
      episodeFt = [];
    }

    // ── RRF merge ────────────────────────────────────────────────────────────
    // If full-text returns nothing, cosine-only result is used.
    const hasVecResults = semanticVec.length > 0 || episodeVec.length > 0;

    if (hasVecResults) {
      semantics = rrfMerge(semanticVec, semanticFt, limit);
      episodes = rrfMerge(episodeVec, episodeFt, limit);
    } else {
      // No vector results — fall back to LIKE for rows without embeddings yet
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

  const procedurals = await prisma.memoryProcedural.findMany({
    where: {
      userId,
      description: { contains: query },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return { semantics, episodes, hypotheses, procedurals };
}
