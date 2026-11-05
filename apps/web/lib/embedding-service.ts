/**
 * Embedding service — thin wrapper around the model router's embed() function.
 *
 * All provider selection is handled by lib/model-router.ts (embed()).
 * This file exists only to keep the public API surface stable for callers.
 * Non-negotiable #8: no provider SDK is imported here.
 */

import { logger } from '@/lib/logger';
import { embed } from '@/lib/model-router';
import { admittedEmbed, embeddingCostClass } from '@/lib/model-router/dispatch';

/**
 * Generate an embedding for the given text via the model router.
 * Returns null on failure — never blocks a memory write.
 */
export async function generateEmbedding(text: string, userId?: string): Promise<number[] | null> {
  try {
    if (userId) return await admittedEmbed(userId, text);
    // No account: a remote embed would be server-funded. Local-only transport remains for scripts/tests.
    if (embeddingCostClass() === 'unknown') return null;
    return await embed({ text });
  } catch (err: any) {
    logger.warn('Embedding generation failed (non-blocking)', { error: err?.message });
    return null;
  }
}
