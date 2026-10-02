/**
 * Embedding service — generates vector embeddings for memory storage.
 *
 * Provider selection (in priority order):
 * 1. EMBEDDINGS_URL is set → use that OpenAI-compatible endpoint with EMBEDDINGS_MODEL
 * 2. OPENAI_API_KEY is set and EMBEDDINGS_URL is not set → use OpenAI text-embedding-3-small
 * 3. Fall back to Ollama at localhost:11434 with nomic-embed-text
 *
 * If the embedding call fails for any reason, returns null.
 * A null embedding never blocks a memory write.
 */

import { logger } from '@/lib/logger';

export async function generateEmbedding(text: string): Promise<number[] | null> {
  // Read env vars inside the function so they can be overridden per-test
  const embeddingsUrl = process.env.EMBEDDINGS_URL;
  const embeddingsModel = process.env.EMBEDDINGS_MODEL ?? 'nomic-embed-text';
  const openaiApiKey = process.env.OPENAI_API_KEY;

  try {
    let baseUrl: string;
    let model: string;
    let apiKey: string | undefined;

    if (embeddingsUrl) {
      // Explicit embeddings endpoint configured
      baseUrl = embeddingsUrl.replace(/\/$/, '');
      model = embeddingsModel;
      apiKey = process.env.EMBEDDINGS_API_KEY;
    } else if (openaiApiKey) {
      // Use OpenAI text-embedding-3-small
      baseUrl = 'https://api.openai.com/v1';
      model = 'text-embedding-3-small';
      apiKey = openaiApiKey;
    } else {
      // Default: Ollama local
      baseUrl = 'http://localhost:11434/v1';
      model = embeddingsModel;
      apiKey = undefined;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn('Embedding request failed', { status: res.status, body: body.substring(0, 200) });
      return null;
    }

    const json = await res.json();
    const embedding = json?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      logger.warn('Embedding response missing data', { keys: Object.keys(json ?? {}) });
      return null;
    }

    return embedding as number[];
  } catch (err: any) {
    logger.warn('Embedding generation failed (non-blocking)', { error: err?.message });
    return null;
  }
}
