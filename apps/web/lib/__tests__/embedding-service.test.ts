/**
 * Tests for embedding-service.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to get a fresh import of the module without cached env values
async function getModule() {
  return await import('@/lib/embedding-service');
}

describe('generateEmbedding', () => {
  beforeEach(() => {
    // Reset module registry before every test so EMBEDDING_DIM is re-read from env.
    vi.resetModules();
  });

  afterEach(() => {
    mockFetch.mockReset();
    vi.unstubAllEnvs();
  });

  it('returns an array of numbers on success (EMBEDDINGS_URL path)', async () => {
    vi.stubEnv('EMBEDDINGS_URL', 'http://localhost:11434/v1');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('EMBEDDING_DIM', '3');

    const embedding = [0.1, 0.2, 0.3];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding }] }),
      text: async () => '',
    });

    const { generateEmbedding } = await getModule();
    const result = await generateEmbedding('hello world');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(embedding);
  });

  it('returns null gracefully when service throws (connection refused)', async () => {
    vi.stubEnv('EMBEDDINGS_URL', '');
    vi.stubEnv('OPENAI_API_KEY', '');

    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const { generateEmbedding } = await getModule();
    const result = await generateEmbedding('hello world');

    expect(result).toBeNull();
  });

  it('returns null when response is not ok (503)', async () => {
    vi.stubEnv('EMBEDDINGS_URL', '');
    vi.stubEnv('OPENAI_API_KEY', '');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    const { generateEmbedding } = await getModule();
    const result = await generateEmbedding('hello world');

    expect(result).toBeNull();
  });

  it('returns null when OPENAI_API_KEY is set but EMBEDDINGS_URL and EMBEDDING_MODEL are not (H5: no silent cloud fallback)', async () => {
    vi.stubEnv('EMBEDDINGS_URL', '');
    vi.stubEnv('EMBEDDING_MODEL', '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');

    const { generateEmbedding } = await getModule();
    const result = await generateEmbedding('test fact');

    // H5 fix: branch 3 (OpenAI-only-key fallback) has been removed.
    // Without EMBEDDINGS_URL or EMBEDDING_MODEL, embed() returns null — no silent paid call.
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('uses EMBEDDINGS_URL when explicitly configured', async () => {
    vi.stubEnv('EMBEDDINGS_URL', 'http://127.0.0.1:8080/v1');
    vi.stubEnv('EMBEDDINGS_MODEL', 'custom-model');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('EMBEDDING_DIM', '2');

    const embedding = [0.7, 0.8];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding }] }),
      text: async () => '',
    });

    const { generateEmbedding } = await getModule();
    const result = await generateEmbedding('test');

    expect(result).toEqual(embedding);
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(callArgs[0]).toBe('http://127.0.0.1:8080/v1/embeddings');
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.model).toBe('custom-model');
  });
});
