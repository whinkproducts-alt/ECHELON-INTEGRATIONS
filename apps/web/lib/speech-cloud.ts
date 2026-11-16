/**
 * Cloud speech providers: Groq (STT), OpenAI (STT, TTS), ElevenLabs (STT, TTS). OFF by default.
 * A provider runs only when (1) it is named in SPEECH_CLOUD_PROVIDERS, (2) its key is set, (3) Local-Only is
 * off, (4) the account is not locked down, (5) the owner has delegated Class B `speech_cloud`, and
 * (6) model-router admission passes (known price, spend cap). Audio and text leave the machine, so
 * the destination is a fixed host. Keys come from the environment only and are never logged.
 */
import { isLocalOnlyMode } from '@/lib/local-only';
import { isLockedDown } from '@/lib/safety/lockdown';
import { checkPermission } from '@/lib/permission-engine';
import { holdDispatch, releaseDispatch, reserveDispatch, settleDispatch, voicePriceKnown } from '@/lib/model-router/admission';
import { boundedSpeechBody } from '@/lib/speech-services';

export type CloudSpeechProvider = 'groq' | 'openai' | 'elevenlabs';
interface Spec { host: string; keyEnv: string; stt?: { path: string; model: string }; tts?: { path: (voice: string) => string; body: (text: string, voice: string) => object; accept: string } }
export const CLOUD_SPEECH: Record<CloudSpeechProvider, Spec> = {
  groq: { host: 'api.groq.com', keyEnv: 'GROQ_API_KEY', stt: { path: '/openai/v1/audio/transcriptions', model: 'whisper-large-v3-turbo' } },
  openai: {
    host: 'api.openai.com', keyEnv: 'OPENAI_API_KEY', stt: { path: '/v1/audio/transcriptions', model: 'whisper-1' },
    tts: { path: () => '/v1/audio/speech', body: (input, voice) => ({ model: 'tts-1', input, voice, response_format: 'mp3' }), accept: 'audio/mpeg' },
  },
  elevenlabs: {
    host: 'api.elevenlabs.io', keyEnv: 'ELEVENLABS_API_KEY', stt: { path: '/v1/speech-to-text', model: 'scribe_v1' },
    tts: { path: (voice) => `/v1/text-to-speech/${encodeURIComponent(voice)}`, body: (text) => ({ text, model_id: 'eleven_turbo_v2_5' }), accept: 'audio/mpeg' },
  },
};

export class CloudSpeechError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = 'CloudSpeechError'; } }

export function cloudSpeechEnabled(provider: CloudSpeechProvider, env: NodeJS.ProcessEnv = process.env): boolean {
  if (isLocalOnlyMode(env)) return false;
  const on = (env.SPEECH_CLOUD_PROVIDERS ?? '').split(',').map((s) => s.trim().toLowerCase());
  return on.includes(provider) && !!env[CLOUD_SPEECH[provider].keyEnv]?.trim();
}

async function run<T>(userId: string, provider: CloudSpeechProvider, channel: 'stt' | 'tts', units: number, deps: { env?: NodeJS.ProcessEnv }, call: (key: string) => Promise<T>): Promise<T> {
  const env = deps.env ?? process.env;
  if (!CLOUD_SPEECH[provider]?.[channel]) throw new CloudSpeechError('UNSUPPORTED', `${provider} has no ${channel}`);
  if (isLocalOnlyMode(env)) throw new CloudSpeechError('LOCAL_ONLY', 'Speech is not available in Local-Only mode');
  if (await isLockedDown(userId)) throw new CloudSpeechError('LOCKDOWN', 'Lockdown is active');
  if (!cloudSpeechEnabled(provider, env)) throw new CloudSpeechError('NOT_ENABLED', `${provider} speech is off`);
  const perm = await checkPermission(userId, 'speech_cloud', 'B', undefined, { params: { provider, channel } });
  if (!perm.allowed) throw new CloudSpeechError('NOT_DELEGATED', perm.reason ?? 'Cloud speech needs the owner to delegate it');
  const price = voicePriceKnown(env);
  let attempt: string;
  try {
    attempt = (await reserveDispatch({ userId, purpose: channel === 'stt' ? 'voice_stt' : 'voice_tts', model: `${provider}-${channel}`, provider, maxTokens: 1, inputChars: 0, reservedTokens: Math.max(1, Math.min(units, 2_000_000_000)), reservedMicros: price.known ? price.micros : 0, priceKnown: price.known, costClass: 'metered', kind: 'other' }, { env })).attemptKey;
  } catch (e) { throw new CloudSpeechError('ADMISSION_DENIED', `Cloud speech refused: ${(e as { code?: string }).code ?? 'admission'}`); }
  try {
    const out = await call(env[CLOUD_SPEECH[provider].keyEnv]!.trim());
    await settleDispatch({ userId, attemptKey: attempt, tokensIn: Math.max(1, Math.min(units, 2_000_000_000)), tokensOut: 0, basis: 'estimated' }).catch(() => holdDispatch({ userId, attemptKey: attempt, uncertainty: 'settlement_failed' }));
    return out;
  } catch (e) {
    await holdDispatch({ userId, attemptKey: attempt, uncertainty: 'transport_unknown' }).catch(() => releaseDispatch({ userId, attemptKey: attempt, externalAttemptStarted: false }).catch(() => undefined));
    throw e;
  }
}

const timeout = () => AbortSignal.timeout(90_000);

export function transcribeCloud(userId: string, provider: CloudSpeechProvider, audio: Blob, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
  return run(userId, provider, 'stt', audio.size, deps, async (key) => {
    const spec = CLOUD_SPEECH[provider], stt = spec.stt!;
    const body = new FormData(); body.append('file', audio, 'audio'); body.append('model' , stt.model);
    const headers: Record<string, string> = provider === 'elevenlabs' ? { 'xi-api-key': key } : { authorization: `Bearer ${key}` };
    if (provider === 'elevenlabs') { body.delete('model'); body.append('model_id', stt.model); }
    const res = await (deps.fetch ?? fetch)(`https://${spec.host}${stt.path}`, { method: 'POST', redirect: 'error', headers, body, signal: timeout() });
    if (!res.ok) throw new CloudSpeechError('EXEC_FAILED', 'Speech recognition unavailable');
    const data = JSON.parse(new TextDecoder().decode(await boundedSpeechBody(res, 65536)));
    if (typeof data.text !== 'string' || data.text.length > 16000) throw new CloudSpeechError('EXEC_FAILED', 'Invalid transcription');
    return data.text;
  });
}

export function synthesizeCloud(userId: string, provider: CloudSpeechProvider, text: string, voice: string, deps: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): Promise<Uint8Array> {
  return run(userId, provider, 'tts', text.length, deps, async (key) => {
    const spec = CLOUD_SPEECH[provider], tts = spec.tts!;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(voice)) throw new CloudSpeechError('VAL_INPUT_INVALID', 'invalid voice');
    if (text.length > 5000) throw new CloudSpeechError('VAL_INPUT_INVALID', 'text too long');
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: tts.accept, ...(provider === 'elevenlabs' ? { 'xi-api-key': key } : { authorization: `Bearer ${key}` }) };
    const res = await (deps.fetch ?? fetch)(`https://${spec.host}${tts.path(voice)}`, { method: 'POST', redirect: 'error', headers, body: JSON.stringify(tts.body(text, voice)), signal: timeout() });
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio/')) throw new CloudSpeechError('EXEC_FAILED', 'Speech synthesis unavailable');
    return boundedSpeechBody(res, 16 * 1024 * 1024);
  });
}
