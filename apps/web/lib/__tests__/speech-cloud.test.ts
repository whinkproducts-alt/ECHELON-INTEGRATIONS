import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  perm: vi.fn(async () => ({ allowed: true, method: 'delegated' })), locked: vi.fn(async () => false),
  reserve: vi.fn(async () => ({ attemptKey: 'attempt-12345' })), settle: vi.fn(async () => undefined), hold: vi.fn(async () => undefined), release: vi.fn(async () => undefined),
}));
vi.mock('@/lib/permission-engine', () => ({ checkPermission: m.perm }));
vi.mock('@/lib/safety/lockdown', () => ({ isLockedDown: m.locked }));
vi.mock('@/lib/model-router/admission', () => ({ reserveDispatch: m.reserve, settleDispatch: m.settle, holdDispatch: m.hold, releaseDispatch: m.release, voicePriceKnown: () => ({ known: true, micros: 3 }) }));
import { cloudSpeechEnabled, synthesizeCloud, transcribeCloud } from '@/lib/speech-cloud';

const env = (o: Record<string, string> = {}) => ({ SPEECH_CLOUD_PROVIDERS: 'groq,openai,elevenlabs', GROQ_API_KEY: 'g', OPENAI_API_KEY: 'o', ELEVENLABS_API_KEY: 'e', ...o }) as unknown as NodeJS.ProcessEnv;
const stt = () => vi.fn(async () => new Response(JSON.stringify({ text: 'hello' }), { status: 200 }));
const audio = new Blob(['abc'], { type: 'audio/wav' });
beforeEach(() => { vi.clearAllMocks(); m.perm.mockResolvedValue({ allowed: true, method: 'delegated' }); m.locked.mockResolvedValue(false); });

describe('cloud speech', () => {
  it('is off by default and when a key is missing', () => {
    expect(cloudSpeechEnabled('groq', {} as NodeJS.ProcessEnv)).toBe(false);
    expect(cloudSpeechEnabled('groq', env({ GROQ_API_KEY: '' }))).toBe(false);
    expect(cloudSpeechEnabled('groq', env())).toBe(true);
    expect(cloudSpeechEnabled('openai', env({ SPEECH_CLOUD_PROVIDERS: 'groq' }))).toBe(false);
  });

  it('refused in Local-Only mode before anything is sent', async () => {
    const f = stt();
    await expect(transcribeCloud('u', 'groq', audio, { fetch: f, env: env({ WHINK_LOCAL_ONLY: 'true' }) })).rejects.toMatchObject({ code: 'LOCAL_ONLY' });
    expect(f).not.toHaveBeenCalled(); expect(m.reserve).not.toHaveBeenCalled();
  });

  it.each([['groq', 'api.groq.com'], ['openai', 'api.openai.com'], ['elevenlabs', 'api.elevenlabs.io']] as const)('%s STT goes to its host with the key and settles', async (p, host) => {
    const f = stt();
    expect(await transcribeCloud('u', p, audio, { fetch: f, env: env() })).toBe('hello');
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(new URL(url).host).toBe(host);
    expect(JSON.stringify(init.headers)).toMatch(/"(authorization|xi-api-key)"/);
    expect(m.settle).toHaveBeenCalledOnce();
  });

  it('needs owner delegation, a lifted lockdown and admission', async () => {
    const f = stt();
    m.perm.mockResolvedValueOnce({ allowed: false, method: 'requires_confirmation', reason: 'no' } as never);
    await expect(transcribeCloud('u', 'groq', audio, { fetch: f, env: env() })).rejects.toMatchObject({ code: 'NOT_DELEGATED' });
    m.locked.mockResolvedValueOnce(true);
    await expect(transcribeCloud('u', 'groq', audio, { fetch: f, env: env() })).rejects.toMatchObject({ code: 'LOCKDOWN' });
    m.reserve.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'SPEND_HARD_LIMIT' }));
    await expect(transcribeCloud('u', 'groq', audio, { fetch: f, env: env() })).rejects.toMatchObject({ code: 'ADMISSION_DENIED' });
    expect(f).not.toHaveBeenCalled();
  });

  it('TTS: groq has none; openai and elevenlabs return audio; a non-audio reply fails and keeps the hold', async () => {
    await expect(synthesizeCloud('u', 'groq', 'hi', 'v', { env: env() })).rejects.toMatchObject({ code: 'UNSUPPORTED' });
    const good = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } }));
    expect((await synthesizeCloud('u', 'openai', 'hi', 'alloy', { fetch: good, env: env() })).length).toBe(3);
    expect((await synthesizeCloud('u', 'elevenlabs', 'hi', 'abc123', { fetch: good, env: env() })).length).toBe(3);
    expect((good.mock.calls[1] as unknown as [string])[0]).toBe('https://api.elevenlabs.io/v1/text-to-speech/abc123');
    const bad = vi.fn(async () => new Response('x', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(synthesizeCloud('u', 'openai', 'hi', 'alloy', { fetch: bad, env: env() })).rejects.toMatchObject({ code: 'EXEC_FAILED' });
    expect(m.hold).toHaveBeenCalled();
    await expect(synthesizeCloud('u', 'elevenlabs', 'hi', '../x', { fetch: good, env: env() })).rejects.toMatchObject({ code: 'VAL_INPUT_INVALID' });
  });
});
