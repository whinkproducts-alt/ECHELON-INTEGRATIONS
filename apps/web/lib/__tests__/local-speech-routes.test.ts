import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
const fetchMock = vi.fn();
vi.mock('@/auth', () => ({ auth: vi.fn(async () => ({ user: { id: 'owner' } })) }));
vi.mock('@/lib/safety/lockdown', () => ({ isLockedDown: vi.fn(async () => false), ledgerLockdownBlock: vi.fn(), LOCKDOWN_MESSAGE: 'Locked' }));
vi.mock('@/lib/model-router/dispatch', () => ({ runAdmittedVoice: vi.fn(async (_input, run) => run()), DispatchBlockedError: class extends Error {} }));
vi.mock('@/lib/local-only-guard', () => ({ ledgerLocalOnlyBlock: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset();
  vi.stubEnv('LOCAL_SPEECH_TOKEN', 'test-only-' + 'x'.repeat(32));
  vi.stubEnv('STT_PROVIDER', 'local-whisper'); vi.stubEnv('TTS_PROVIDER', 'local-kokoro');
  vi.stubEnv('STT_URL', 'http://127.0.0.1:8765'); vi.stubEnv('TTS_URL', 'http://127.0.0.1:8765');
  vi.stubEnv('WHINK_LOCAL_ONLY', 'true');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('integrated speech routes', () => {
  it('forwards WAV with sidecar authentication and keeps transcript confidence absent', async () => {
    const { POST } = await import('@/app/api/voice/stt/route');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: 'hello', confidence: 1 }), { headers: { 'content-type': 'application/json' } }));
    const form = new FormData(); form.append('audio', new Blob(['RIFF'], { type: 'audio/wav' }), 'input.wav');
    const response = await POST(new Request('http://localhost/api/voice/stt', { method: 'POST', body: form, headers: { 'content-length': '256' } }) as NextRequest);
    expect(await response.json()).toEqual({ text: 'hello' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/audio/transcriptions');
    expect(options.headers.Authorization).toBe('Bearer test-only-' + 'x'.repeat(32));
    expect(options.redirect).toBe('error');
    expect(options.body.get('file').name).toBe('audio.wav');
  });
  it('requests WAV and preserves its actual MIME', async () => {
    const { POST } = await import('@/app/api/voice/tts/route');
    fetchMock.mockResolvedValue(new Response('RIFF', { headers: { 'content-type': 'audio/wav' } }));
    const response = await POST(new Request('http://localhost/api/voice/tts', { method: 'POST', body: JSON.stringify({ text: 'hello' }) }) as NextRequest);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'kokoro', voice: 'af_heart', response_format: 'wav' });
  });
  it('does not forward sidecar credentials to a remote URL even outside Local-Only', async () => {
    vi.stubEnv('WHINK_LOCAL_ONLY', 'false'); vi.stubEnv('TTS_URL', 'https://external.example');
    const { POST } = await import('@/app/api/voice/tts/route');
    const response = await POST(new Request('http://localhost/api/voice/tts', { method: 'POST', body: JSON.stringify({ text: 'hello' }) }) as NextRequest);
    expect(response.status).toBe(502); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps Docker host bridge blocked by Local-Only', async () => {
    vi.stubEnv('TTS_URL', 'http://host.docker.internal:8765');
    const { POST } = await import('@/app/api/voice/tts/route');
    const response = await POST(new Request('http://localhost/api/voice/tts', { method: 'POST', body: JSON.stringify({ text: 'hello' }) }) as NextRequest);
    expect(response.status).toBe(503); expect(fetchMock).not.toHaveBeenCalled();
  });
});
