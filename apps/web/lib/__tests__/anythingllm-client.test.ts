/**
 * Tests for lib/anythingllm-client.ts
 * fetch is mocked at the global level — no real HTTP calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper to build a minimal AnythingLLM chat response
function makeChatResponse(sources: unknown[] = [], textResponse?: string) {
  return { sources, textResponse: textResponse ?? null };
}

// Helper to mock fetch with a given status and body
function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('searchDocuments', () => {
  beforeEach(() => {
    vi.resetModules();
    // Default: local URL, no key needed
    delete process.env.ANYTHINGLLM_URL;
    delete process.env.ANYTHINGLLM_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns typed results from a successful mock response', async () => {
    global.fetch = mockFetch(200, makeChatResponse([
      { title: 'Doc A', text: 'Content A', url: 'file://a.txt', score: 0.9 },
      { title: 'Doc B', text: 'Content B', url: 'file://b.txt', score: 0.8 },
    ]));

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('test query');
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Doc A');
    expect(results[0].content).toBe('Content A');
    expect(results[0].source).toBe('file://a.txt');
    expect(results[0].score).toBe(0.9);
  });

  it('returns empty array on non-2xx response without throwing', async () => {
    global.fetch = mockFetch(500, {});

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('test query');
    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws (service unavailable)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('test query');
    expect(results).toEqual([]);
  });

  it('filters out results with score below 0.3', async () => {
    global.fetch = mockFetch(200, makeChatResponse([
      { title: 'Low score', text: 'Content', url: 'file://x.txt', score: 0.1 },
      { title: 'High score', text: 'Content', url: 'file://y.txt', score: 0.9 },
    ]));

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('test query');
    const titles = results.map((r) => r.title);
    // Score below 0.3 threshold must be excluded
    expect(titles).toContain('High score');
    expect(titles).not.toContain('Low score');
  });

  it('throws when URL is non-local and ANYTHINGLLM_API_KEY is unset', async () => {
    process.env.ANYTHINGLLM_URL = 'https://remote.example.com';
    delete process.env.ANYTHINGLLM_API_KEY;

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    await expect(searchDocuments('query')).rejects.toThrow('ANYTHINGLLM_API_KEY');
  });

  it('does not throw when URL is non-local and API key is set', async () => {
    process.env.ANYTHINGLLM_URL = 'https://remote.example.com';
    process.env.ANYTHINGLLM_API_KEY = 'test-key-123';
    global.fetch = mockFetch(200, makeChatResponse([]));

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    await expect(searchDocuments('query')).resolves.toEqual([]);
  });

  it('returns textResponse as single result when sources array is empty', async () => {
    global.fetch = mockFetch(200, makeChatResponse([], 'This is the model answer'));

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('query');
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('This is the model answer');
    expect(results[0].title).toBe('Response');
  });
});
