/**
 * Tests for lib/anythingllm-client.ts
 * fetch is mocked at the global level — no real HTTP calls.
 *
 * The canonical export is queryDocuments (C3). The searchDocuments alias is
 * also tested for backward compatibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper: build a minimal AnythingLLM /query response (1.18.0 shape)
function makeQueryResponse(results: unknown[] = []) {
  return { results };
}

// Helper to mock fetch with a given status and body
function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('queryDocuments', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ANYTHINGLLM_URL;
    delete process.env.ANYTHINGLLM_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const TEST_USER = 'user-test-123';
  const TEST_SLUG = 'test-workspace';

  it('returns empty array when ANYTHINGLLM_URL is not set (unavailable, no throw)', async () => {
    delete process.env.ANYTHINGLLM_URL;
    const { queryDocuments } = await import('@/lib/anythingllm-client');
    const result = await queryDocuments(TEST_USER, TEST_SLUG, 'query');
    expect(result).toEqual([]);
  });

  it('returns typed DocumentChunk results from a successful mock response', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    global.fetch = mockFetch(200, makeQueryResponse([
      { docName: 'Doc A', chunkId: 'c1', metadata: { page: 1 }, score: 0.9, text: 'Content A' },
      { docName: 'Doc B', chunkId: 'c2', metadata: { page: 2 }, score: 0.8, text: 'Content B' },
    ]));

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    const results = await queryDocuments(TEST_USER, TEST_SLUG, 'test query');
    expect(results).toHaveLength(2);
    expect(results[0].documentName).toBe('Doc A');
    expect(results[0].text).toBe('Content A');
    expect(results[0].chunkId).toBe('c1');
    expect(results[0].page).toBe(1);
    expect(results[0].score).toBe(0.9);
  });

  it('also handles sources array response shape (AnythingLLM variant)', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    global.fetch = mockFetch(200, {
      sources: [
        { title: 'Doc C', chunkId: 'c3', score: 0.7, text: 'Content C' },
      ],
    });

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    const results = await queryDocuments(TEST_USER, TEST_SLUG, 'test query');
    expect(results).toHaveLength(1);
    expect(results[0].documentName).toBe('Doc C');
  });

  it('drops chunks where documentName is missing or empty', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    global.fetch = mockFetch(200, makeQueryResponse([
      { docName: '', chunkId: 'c1', score: 0.9, text: 'No name chunk' },
      { chunkId: 'c2', score: 0.8, text: 'Also no name' },
      { docName: 'Good Doc', chunkId: 'c3', score: 0.7, text: 'Has a name' },
    ]));

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    const results = await queryDocuments(TEST_USER, TEST_SLUG, 'query');
    expect(results).toHaveLength(1);
    expect(results[0].documentName).toBe('Good Doc');
  });

  it('returns empty array on non-2xx response without throwing', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    global.fetch = mockFetch(500, {});

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    const results = await queryDocuments(TEST_USER, TEST_SLUG, 'test query');
    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws (service unavailable — C11 down handling)', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    const results = await queryDocuments(TEST_USER, TEST_SLUG, 'test query');
    expect(results).toEqual([]);
  });

  it('throws when URL is non-local and ANYTHINGLLM_API_KEY is unset', async () => {
    process.env.ANYTHINGLLM_URL = 'https://remote.example.com';
    delete process.env.ANYTHINGLLM_API_KEY;

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    await expect(queryDocuments(TEST_USER, TEST_SLUG, 'query')).rejects.toThrow('ANYTHINGLLM_API_KEY');
  });

  it('does not throw when URL is non-local and API key is set', async () => {
    process.env.ANYTHINGLLM_URL = 'https://remote.example.com';
    process.env.ANYTHINGLLM_API_KEY = 'test-key-123';
    global.fetch = mockFetch(200, makeQueryResponse([]));

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    await expect(queryDocuments(TEST_USER, TEST_SLUG, 'query')).resolves.toEqual([]);
  });

  it('sends Authorization header when API key is set', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    process.env.ANYTHINGLLM_API_KEY = 'my-secret-key';
    const spy = mockFetch(200, makeQueryResponse([]));
    global.fetch = spy;

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    await queryDocuments(TEST_USER, TEST_SLUG, 'query');

    const callHeaders = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders?.['Authorization']).toBe('Bearer my-secret-key');
  });

  it('calls the /api/v1/workspace/:slug/query endpoint (not /chat)', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    const spy = mockFetch(200, makeQueryResponse([]));
    global.fetch = spy;

    const { queryDocuments } = await import('@/lib/anythingllm-client');
    await queryDocuments(TEST_USER, TEST_SLUG, 'query');

    const url: string = spy.mock.calls[0][0];
    expect(url).toContain('/api/v1/workspace/');
    expect(url).toContain('/query');
    expect(url).not.toContain('/chat');
  });
});

describe('searchDocuments (legacy alias)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ANYTHINGLLM_URL;
    delete process.env.ANYTHINGLLM_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const TEST_USER = 'user-test-123';
  const TEST_SLUG = 'test-workspace';

  it('returns typed results from a successful mock response (via queryDocuments alias)', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeQueryResponse([
        { docName: 'Doc A', chunkId: 'c1', score: 0.9, text: 'Content A' },
        { docName: 'Doc B', chunkId: 'c2', score: 0.8, text: 'Content B' },
      ])),
    });

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('test query', TEST_USER, TEST_SLUG);
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Doc A');
    expect(results[0].content).toContain('Content A');
    expect(results[0].score).toBe(0.9);
  });

  it('returns empty array on non-2xx response without throwing', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('test query', TEST_USER, TEST_SLUG);
    expect(results).toEqual([]);
  });

  it('returns empty array when fetch throws (service unavailable)', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('test query', TEST_USER, TEST_SLUG);
    expect(results).toEqual([]);
  });

  it('throws when URL is non-local and ANYTHINGLLM_API_KEY is unset', async () => {
    process.env.ANYTHINGLLM_URL = 'https://remote.example.com';
    delete process.env.ANYTHINGLLM_API_KEY;

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    await expect(searchDocuments('query', TEST_USER, TEST_SLUG)).rejects.toThrow('ANYTHINGLLM_API_KEY');
  });

  it('does not throw when URL is non-local and API key is set', async () => {
    process.env.ANYTHINGLLM_URL = 'https://remote.example.com';
    process.env.ANYTHINGLLM_API_KEY = 'test-key-123';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeQueryResponse([])),
    });

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    await expect(searchDocuments('query', TEST_USER, TEST_SLUG)).resolves.toEqual([]);
  });

  it('does not include textResponse LLM output (H1 security fix — alias discards it)', async () => {
    process.env.ANYTHINGLLM_URL = 'http://127.0.0.1:3001';
    // Return a /query-style response with no results (textResponse is never in /query responses)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(makeQueryResponse([])),
    });

    const { searchDocuments } = await import('@/lib/anythingllm-client');
    const results = await searchDocuments('query', TEST_USER, TEST_SLUG);
    expect(results).toHaveLength(0);
  });
});
