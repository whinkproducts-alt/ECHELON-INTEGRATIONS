/**
 * Tests for /api/voice/stt and /api/voice/tts route handlers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Auth mock ─────────────────────────────────────────────────────────────────

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { auth } from '@/auth';
const mockAuth = auth as ReturnType<typeof vi.fn>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession() {
  return { user: { id: 'user-1' } };
}

function makeJsonRequest(body: unknown, url = 'http://localhost') {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeFormRequest(blob: Blob, url = 'http://localhost') {
  const form = new FormData();
  form.append('audio', blob, 'audio.webm');
  return new Request(url, { method: 'POST', body: form });
}

// ── STT route ────────────────────────────────────────────────────────────────

describe('STT route /api/voice/stt', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuth.mockResolvedValue(makeSession());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns { fallback: "browser" } when STT_URL is not set', async () => {
    vi.stubEnv('STT_URL', '');
    const { POST } = await import('@/app/api/voice/stt/route');
    const blob = new Blob(['fake audio'], { type: 'audio/webm' });
    const req = makeFormRequest(blob) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.fallback).toBe('browser');
    expect(data.text).toBe('');
  });

  it('returns 401 when no session', async () => {
    vi.stubEnv('STT_URL', '');
    mockAuth.mockResolvedValue(null);
    const { POST } = await import('@/app/api/voice/stt/route');
    const blob = new Blob(['fake audio'], { type: 'audio/webm' });
    const req = makeFormRequest(blob) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('forwards to STT_URL when set and returns transcript', async () => {
    vi.stubEnv('STT_URL', 'http://fake-whisper:8765/v1');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'hello world' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('@/app/api/voice/stt/route');
    const blob = new Blob(['fake audio'], { type: 'audio/webm' });
    const req = makeFormRequest(blob) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.text).toBe('hello world');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://fake-whisper:8765/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

// ── TTS route ────────────────────────────────────────────────────────────────

describe('TTS route /api/voice/tts', () => {
  beforeEach(() => {
    vi.resetModules();
    mockAuth.mockResolvedValue(makeSession());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 501 { fallback: "browser" } when TTS_URL is not set', async () => {
    vi.stubEnv('TTS_URL', '');
    const { POST } = await import('@/app/api/voice/tts/route');
    const req = makeJsonRequest({ text: 'Hello' }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(501);
    const data = await res.json();
    expect(data.fallback).toBe('browser');
  });

  it('returns 401 when no session', async () => {
    vi.stubEnv('TTS_URL', '');
    mockAuth.mockResolvedValue(null);
    const { POST } = await import('@/app/api/voice/tts/route');
    const req = makeJsonRequest({ text: 'Hello' }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('forwards to TTS_URL when set and streams audio back', async () => {
    vi.stubEnv('TTS_URL', 'http://fake-kokoro:8766/v1');
    const fakeAudio = new Uint8Array([1, 2, 3]).buffer;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(fakeAudio, {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { POST } = await import('@/app/api/voice/tts/route');
    const req = makeJsonRequest({ text: 'Hello WHINK' }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://fake-kokoro:8766/v1/audio/speech',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns 400 when text exceeds 2000 chars', async () => {
    vi.stubEnv('TTS_URL', 'http://fake-kokoro:8766/v1');
    const { POST } = await import('@/app/api/voice/tts/route');
    const req = makeJsonRequest({ text: 'a'.repeat(2001) }) as unknown as Parameters<typeof POST>[0];
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
