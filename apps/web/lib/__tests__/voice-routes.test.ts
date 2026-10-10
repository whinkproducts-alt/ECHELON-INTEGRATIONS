/**
 * Regression tests for Phase 4 voice routes: STT (Deepgram) and TTS (OpenAI).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mocks ────────────────────────────────────────────────────────────

const mockSession = { user: { id: 'user-1' } };
const mockFetch = vi.fn();

// ─── STT route ───────────────────────────────────────────────────────────────

describe('POST /api/voice/stt', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.fetch = mockFetch;
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(mockSession) }));
  });

  it('returns 401 when unauthenticated', async () => {
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));
    const { POST } = await import('@/app/api/voice/stt/route');
    const form = new FormData();
    form.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'audio.webm');
    const req = new Request('http://localhost/api/voice/stt', { method: 'POST', body: form });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('Deepgram path: returns transcript on success', async () => {
    process.env.STT_PROVIDER = 'deepgram';
    process.env.DEEPGRAM_API_KEY = 'dg-test-key';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: { channels: [{ alternatives: [{ transcript: 'hello world' }] }] },
      }),
    } as any);

    const { POST } = await import('@/app/api/voice/stt/route');
    const form = new FormData();
    form.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'audio.webm');
    const req = new Request('http://localhost/api/voice/stt', { method: 'POST', body: form });
    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.text).toBe('hello world');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('deepgram.com/v1/listen'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Deepgram path: returns 500 when API key missing', async () => {
    process.env.STT_PROVIDER = 'deepgram';
    delete process.env.DEEPGRAM_API_KEY;

    const { POST } = await import('@/app/api/voice/stt/route');
    const form = new FormData();
    form.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'audio.webm');
    const req = new Request('http://localhost/api/voice/stt', { method: 'POST', body: form });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });

  it('Deepgram path: returns 400 when audio field missing', async () => {
    process.env.STT_PROVIDER = 'deepgram';
    process.env.DEEPGRAM_API_KEY = 'dg-key';

    const { POST } = await import('@/app/api/voice/stt/route');
    const form = new FormData();
    const req = new Request('http://localhost/api/voice/stt', { method: 'POST', body: form });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('default path: returns fallback when no STT_URL configured', async () => {
    delete process.env.STT_PROVIDER;
    delete process.env.STT_URL;

    const { POST } = await import('@/app/api/voice/stt/route');
    const form = new FormData();
    form.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'audio.webm');
    const req = new Request('http://localhost/api/voice/stt', { method: 'POST', body: form });
    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fallback).toBe('browser');
    expect(body.text).toBe('');
  });

  it('Deepgram path: returns 413 when content-length exceeds 10 MB', async () => {
    process.env.STT_PROVIDER = 'deepgram';
    process.env.DEEPGRAM_API_KEY = 'dg-test-key';

    const { POST } = await import('@/app/api/voice/stt/route');
    const tenMBPlusOne = 10 * 1024 * 1024 + 1;
    const req = new Request('http://localhost/api/voice/stt', {
      method: 'POST',
      headers: { 'content-length': String(tenMBPlusOne) },
      body: new Uint8Array(1), // tiny body; the header triggers the cap
    });
    const res = await POST(req as any);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
  });

  it('generic path: returns 413 when content-length exceeds 10 MB', async () => {
    delete process.env.STT_PROVIDER;
    process.env.STT_URL = 'http://localhost:9000';

    const { POST } = await import('@/app/api/voice/stt/route');
    const tenMBPlusOne = 10 * 1024 * 1024 + 1;
    const req = new Request('http://localhost/api/voice/stt', {
      method: 'POST',
      headers: { 'content-length': String(tenMBPlusOne) },
      body: new Uint8Array(1),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
    delete process.env.STT_URL;
  });
});

// ─── TTS route ───────────────────────────────────────────────────────────────

describe('POST /api/voice/tts', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    global.fetch = mockFetch;
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(mockSession) }));
  });

  it('returns 401 when unauthenticated', async () => {
    vi.doMock('@/auth', () => ({ auth: vi.fn().mockResolvedValue(null) }));
    const { POST } = await import('@/app/api/voice/tts/route');
    const req = new Request('http://localhost/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when text is empty', async () => {
    const { POST } = await import('@/app/api/voice/tts/route');
    const req = new Request('http://localhost/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('OpenAI path: streams audio on success', async () => {
    process.env.TTS_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    const fakeAudio = new Uint8Array([1, 2, 3]).buffer;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => fakeAudio,
    } as any);

    const { POST } = await import('@/app/api/voice/tts/route');
    const req = new Request('http://localhost/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello WHINK' }),
    });
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('OpenAI path: returns 500 when API key missing', async () => {
    process.env.TTS_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_COMPATIBLE_API_KEY;

    const { POST } = await import('@/app/api/voice/tts/route');
    const req = new Request('http://localhost/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });

  it('default path: returns 501 when no TTS_URL configured', async () => {
    delete process.env.TTS_PROVIDER;
    delete process.env.TTS_URL;

    const { POST } = await import('@/app/api/voice/tts/route');
    const req = new Request('http://localhost/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(501);
  });

  it('rejects text over 2000 chars', async () => {
    const { POST } = await import('@/app/api/voice/tts/route');
    const req = new Request('http://localhost/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'a'.repeat(2001) }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });
});
