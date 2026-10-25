import { prisma } from '@/lib/db';
import { generateEmbedding } from '@/lib/embedding-service';

/**
 * Find memory rows in memory_semantic that are semantically similar to the given
 * embedding for this userId. Uses pgvector cosine distance (<=>).
 *
 * Scoped by userId — never crosses tenant boundaries.
 * Only compares rows that already have an embedding stored.
 */
export async function findSimilarMemories(
  userId: string,
  embedding: number[],
  threshold: number = 0.92,
  limit: number = 5,
): Promise<Array<{ id: string; statement: string; confidence: number; distance: number }>> {
  if (!userId) throw new Error('findSimilarMemories: userId is required');
  const vecLiteral = `[${embedding.join(',')}]`;
  // cosine distance: 0 = identical, 1 = orthogonal. threshold 0.92 sim → 0.08 max distance.
  const distanceThreshold = 1 - threshold;
  return prisma.$queryRawUnsafe<Array<{ id: string; statement: string; confidence: number; distance: number }>>(
    `SELECT id, statement, confidence, (embedding <=> $1::vector) AS distance
     FROM memory_semantic
     WHERE "userId" = $2
       AND "supersededBy" IS NULL
       AND embedding IS NOT NULL
       AND (embedding <=> $1::vector) <= $3
     ORDER BY distance
     LIMIT $4`,
    vecLiteral, userId, distanceThreshold, limit,
  );
}


export interface MemoryWriteInput {
  userId: string;
  type: 'episodic' | 'semantic' | 'procedural' | 'hypothesis';
  statement: string;
  projectId?: string | null;
  source: string;
  sourceId?: string;
  /** Id of the message that triggered auto-extraction (B9). */
  messageId?: string;
  /** LLM model used for extraction — distinct from the embedding model (B9). */
  extractorModel?: string;
  confidence?: number;
  importance?: number;
  eventType?: string;
  /** Absolute event date for episodic memories (B8 — resolved from relative dates). */
  eventDate?: Date;
  epistemicStatus?: string;
  mambaMode?: string;
  rationale?: string;
  entities?: string[];
}

/** Returned by writeMemory. Carries the stored row id and a dedup flag (for semantic). */
export interface MemoryWriteResult {
  id: string;
  /** True when an existing near-duplicate row was updated instead of a new row created. */
  deduped: boolean;
}

export async function writeMemory(input: MemoryWriteInput): Promise<MemoryWriteResult> {
  const {
    userId, type, statement, projectId, source, sourceId, messageId, extractorModel,
    confidence, importance, eventType, eventDate, epistemicStatus,
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
          eventDate: eventDate ?? null,
          messageId: messageId ?? null,
          extractorModel: extractorModel ?? null,
          confidence: confidence ?? 0.8,
          importance: importance ?? 0.5,
          entities: entities ? JSON.stringify(entities) : null,
        },
      });
      // Fire-and-forget embedding update, stamp embeddingModel
      const embeddingModelName = process.env.EMBEDDING_MODEL ?? 'ollama/nomic-embed-text';
      generateEmbedding(statement).then(async (vec) => {
        if (!vec) return;
        await prisma.$executeRawUnsafe(
          `UPDATE memory_episodes SET embedding = $1::vector, "embeddingModel" = $3 WHERE id = $2`,
          `[${vec.join(',')}]`,
          episodeRow.id,
          embeddingModelName,
        );
      }).catch(() => {/* non-blocking */});
      return { id: episodeRow.id, deduped: false };
    }

    case 'semantic': {
      const embeddingModelName = process.env.EMBEDDING_MODEL ?? 'ollama/nomic-embed-text';
      // Generate embedding upfront so we can check for duplicates before inserting.
      const vec = await generateEmbedding(statement);

      // Semantic dedup: if a near-identical fact exists (cosine sim >= 0.92), upsert instead.
      if (vec) {
        try {
          const similar = await findSimilarMemories(userId, vec, 0.92, 1);
          if (similar.length > 0) {
            const existing = similar[0];
            const updated = await prisma.memorySemantic.update({
              where: { id: existing.id },
              data: {
                updatedAt: new Date(),
                confidence: Math.max(existing.confidence, confidence ?? 0.8),
              },
            });
            return { id: updated.id, deduped: true };
          }
        } catch {
          // dedup query failed (e.g. no pgvector extension in test) — proceed with insert
        }
      }

      const semanticRow = await prisma.memorySemantic.create({
        data: {
          userId,
          projectId: projectId ?? null,
          statement,
          sourceType: source,
          sourceId: sourceId ?? null,
          messageId: messageId ?? null,
          extractorModel: extractorModel ?? null,
          confidence: confidence ?? 0.8,
          epistemicStatus: epistemicStatus ?? 'KNOWN',
        },
      });

      // Store embedding and model stamp — already generated, skip a second call
      if (vec) {
        prisma.$executeRawUnsafe(
          `UPDATE memory_semantic SET embedding = $1::vector, "embeddingModel" = $3 WHERE id = $2`,
          `[${vec.join(',')}]`,
          semanticRow.id,
          embeddingModelName,
        ).catch(() => {/* non-blocking */});
      }

      return { id: semanticRow.id, deduped: false };
    }

    case 'procedural': {
      const proceduralRow = await prisma.memoryProcedural.create({
        data: {
          userId,
          category: eventType ?? 'general',
          description: statement,
          confidence: confidence ?? 0.9,
        },
      });
      return { id: proceduralRow.id, deduped: false };
    }

    case 'hypothesis': {
      // Enforce MAMBA Memory Firewall: max confidence 0.4
      const cappedConfidence = Math.min(confidence ?? 0.3, 0.4);
      const hypothesisRow = await prisma.hypothesis.create({
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
      return { id: hypothesisRow.id, deduped: false };
    }

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
