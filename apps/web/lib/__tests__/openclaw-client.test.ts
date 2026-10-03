/**
 * Tests for lib/openclaw-client.ts
 * fetch is mocked globally — no real network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── mock fetch ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Stub AbortSignal.timeout so we don't actually wait
vi.stubGlobal('AbortSignal', {
  timeout: (_ms: number) => ({ aborted: false }),
});

const { listOpenClawTools, callOpenClawTool } = await import('@/lib/openclaw-client');

function makeOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => '{}',
  };
}

// ── listOpenClawTools ─────────────────────────────────────────────────────────
describe('listOpenClawTools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a typed ToolDefinition array from a mock HTTP response', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse([
      { name: 'send_email', description: 'Send an email', inputSchema: { type: 'object', properties: { to: { type: 'string' } } } },
      { name: 'create_calendar_event', description: 'Create a calendar event', inputSchema: { type: 'object' } },
    ]));

    const tools = await listOpenClawTools();

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('send_email');
    expect(tools[0].description).toBe('Send an email');
    expect(tools[0].inputSchema).toEqual({ type: 'object', properties: { to: { type: 'string' } } });
    expect(tools[1].name).toBe('create_calendar_event');
  });

  it('filters out entries with an empty name', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse([
      { name: '', description: 'broken', inputSchema: { type: 'object' } },
      { name: 'valid_tool', description: 'ok', inputSchema: { type: 'object' } },
    ]));

    const tools = await listOpenClawTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('valid_tool');
  });

  it('throws when the server responds with a non-2xx status', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(503));

    await expect(listOpenClawTools()).rejects.toThrow('503');
  });

  it('throws when the payload is not an array', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ tools: [] }));

    await expect(listOpenClawTools()).rejects.toThrow('non-array');
  });

  it('propagates a network error without crashing the process', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(listOpenClawTools()).rejects.toThrow('fetch failed');
    // The process itself did not crash — the promise rejected, which is expected
  });
});

// ── callOpenClawTool ──────────────────────────────────────────────────────────
describe('callOpenClawTool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POSTs to the correct URL with the correct body', async () => {
    const responsePayload = { result: 'email sent' };
    mockFetch.mockResolvedValueOnce(makeOkResponse(responsePayload));

    const result = await callOpenClawTool('send_email', { to: 'victor@example.com' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/tools/send_email');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ to: 'victor@example.com' });
    expect(result).toEqual(responsePayload);
  });

  it('URL-encodes special characters in the tool name', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ ok: true }));

    await callOpenClawTool('tool/with spaces', {});

    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain(' ');
    expect(url).toContain('tool%2Fwith%20spaces');
  });

  it('throws when the server responds with a non-2xx status', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(422));

    await expect(callOpenClawTool('send_email', {})).rejects.toThrow('422');
  });

  it('propagates a network timeout without crashing the process', async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));

    await expect(callOpenClawTool('send_email', {})).rejects.toThrow();
    // Process did not crash — the promise rejected as expected
  });
});
