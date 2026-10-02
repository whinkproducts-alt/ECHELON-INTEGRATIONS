/**
 * Tests for embedding-service.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Helper to get a fresh import of the module without cached env values
async function getModule() {
  return await import('@/lib/embedding-service');
}

describe('generateEmbedding', () => {
  afterEach(() => {
    mockFetch.mockReset();
    vi.unstubAllEnvs();
  });

  it('returns an array of numbers on success (Ollama default path)', async () => {
    vi.stubEnv('EMBEDDINGS_URL', '');
    vi.stubEnv('OPENAI_API_KEY', '');

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

  it('uses OpenAI when OPENAI_API_KEY is set and EMBEDDINGS_URL is not', async () => {
    vi.stubEnv('EMBEDDINGS_URL', '');
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key');

    const embedding = [0.4, 0.5, 0.6];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding }] }),
      text: async () => '',
    });

    const { generateEmbedding } = await getModule();
    const result = await generateEmbedding('test fact');

    expect(result).toEqual(embedding);
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(callArgs[0]).toContain('api.openai.com');
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test-key');
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.model).toBe('text-embedding-3-small');
  });

  it('uses EMBEDDINGS_URL when explicitly configured', async () => {
    vi.stubEnv('EMBEDDINGS_URL', 'http://custom-embed:8080/v1');
    vi.stubEnv('EMBEDDINGS_MODEL', 'custom-model');
    vi.stubEnv('OPENAI_API_KEY', '');

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
    expect(callArgs[0]).toBe('http://custom-embed:8080/v1/embeddings');
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.model).toBe('custom-model');
  });
});
