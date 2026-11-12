/**
 * Production inference entry. Transport stays in model-router.ts; this file is what
 * callers must use so a missing account cannot select a server-funded call.
 */
import { isLoopbackUrl } from '@/lib/local-only';
import { chatOnce, embed, type StreamChatOptions } from '@/lib/model-router';
import {
  classifyVoice,
  DispatchBlockedError,
  embeddingCostClass as embeddingTargetClass,
  holdDispatch,
  preTransportFailure,
  releaseDispatch,
  reserveDispatch,
  settleDispatch,
  uncertaintyOf,
  voicePriceKnown,
  type DispatchPurpose,
  type ReserveInput,
} from './admission';

export interface AdmissionScope {
  userId: string;
  purpose: DispatchPurpose;
  attemptKey?: string;
  correlationId?: string;
  model: string;
  baseUrl?: string;
  hasByok?: boolean;
  maxTokens: number;
  inputChars: number;
  provider?: string;
  kind?: string;
  reservedTokens?: number;
  reservedMicros?: number;
  priceKnown?: boolean;
  costClass?: ReserveInput['costClass'];
}

export async function admittedCall<T>(
  scope: AdmissionScope,
  run: () => Promise<T>,
  usage: (value: T) => { tokensIn: number; tokensOut: number; basis: 'estimated' | 'provider'; model?: string },
): Promise<T> {
  const reserved = await reserveDispatch(scope);
  try {
    const value = await run();
    const u = usage(value);
    try {
      await settleDispatch({ userId: scope.userId, attemptKey: reserved.attemptKey, tokensIn: u.tokensIn, tokensOut: u.tokensOut, basis: u.basis, model: u.model ?? scope.model });
    } catch {
      await holdDispatch({ userId: scope.userId, attemptKey: reserved.attemptKey, uncertainty: 'settlement_failed' }).catch(() => undefined);
    }
    return value;
  } catch (e) {
    // A known pre-transport refusal never left the machine, so the hold can be released.
    // Anything else may have been sent and stays a conservative hold. This does not retry.
    if (preTransportFailure(e)) {
      await releaseDispatch({ userId: scope.userId, attemptKey: reserved.attemptKey, externalAttemptStarted: false }).catch(() =>
        holdDispatch({ userId: scope.userId, attemptKey: reserved.attemptKey, uncertainty: uncertaintyOf(e) }));
    } else {
      await holdDispatch({ userId: scope.userId, attemptKey: reserved.attemptKey, uncertainty: uncertaintyOf(e) }).catch(() => undefined);
    }
    throw e;
  }
}

export async function admittedChatOnce(scope: Omit<AdmissionScope, 'model' | 'maxTokens' | 'inputChars'> & { model?: string }, opts: StreamChatOptions): Promise<string> {
  const model = opts.model ?? scope.model ?? '';
  const inputChars = opts.messages.reduce((n, m) => n + m.content.length, 0);
  return admittedCall(
    { ...scope, model, baseUrl: opts.baseUrl, hasByok: Boolean(opts.apiKey), maxTokens: opts.maxTokens ?? 512, inputChars, kind: 'chat' },
    () => chatOnce(opts),
    (text) => ({ tokensIn: Math.ceil(inputChars / 4), tokensOut: Math.ceil(text.length / 4), basis: 'estimated', model }),
  );
}

export function embeddingCostClass(): 'local' | 'unknown' {
  return embeddingTargetClass();
}

export async function admittedEmbed(userId: string, text: string, attemptKey?: string): Promise<number[] | null> {
  const remote = embeddingCostClass() === 'unknown';
  return admittedCall(
    {
      userId,
      purpose: 'embed',
      attemptKey,
      model: process.env.EMBEDDING_MODEL ?? process.env.EMBEDDINGS_MODEL ?? 'nomic-embed-text',
      provider: remote ? 'embed-remote' : 'embed-local',
      maxTokens: 1,
      inputChars: text.length,
      kind: 'embed',
      costClass: remote ? 'unknown' : 'local',
    },
    () => embed({ text }),
    () => ({ tokensIn: Math.max(1, Math.ceil(text.length / 4)), tokensOut: 0, basis: 'estimated' }),
  );
}

export async function reserveVoice(input: { userId: string; channel: 'stt' | 'tts'; units: number; localEndpoint?: string; provider?: string }) {
  // Only server-configured loopback speech adapters may override legacy provider settings.
  if (input.localEndpoint && !isLoopbackUrl(input.localEndpoint)) throw new Error('Speech endpoint must be loopback');
  const costClass = input.localEndpoint ? 'local' : classifyVoice({ channel: input.channel });
  const price = voicePriceKnown();
  return reserveDispatch({
    userId: input.userId,
    purpose: input.channel === 'stt' ? 'voice_stt' : 'voice_tts',
    model: (input.channel === 'tts' ? process.env.TTS_MODEL : process.env.DEEPGRAM_MODEL) ?? input.channel,
    provider: (input.provider ?? (input.channel === 'stt' ? process.env.STT_PROVIDER : process.env.TTS_PROVIDER) ?? costClass).slice(0, 40),
    maxTokens: 1,
    inputChars: 0,
    reservedTokens: Math.max(1, Math.min(input.units, 2_000_000_000)),
    costClass,
    priceKnown: costClass === 'local' || price.known,
    reservedMicros: costClass === 'metered' ? price.micros : 0,
    kind: 'other',
  });
}

export async function runAdmittedVoice<T>(input: { userId: string; channel: 'stt' | 'tts'; units: number; localEndpoint?: string; provider?: string }, run: () => Promise<T>): Promise<T> {
  const reserved = await reserveVoice(input);
  try {
    const value = await run();
    await settleDispatch({
      userId: input.userId, attemptKey: reserved.attemptKey, model: input.channel,
      tokensIn: Math.max(1, Math.min(input.units, 2_000_000_000)), tokensOut: 0, basis: 'estimated',
    }).catch(() => holdDispatch({ userId: input.userId, attemptKey: reserved.attemptKey, uncertainty: 'settlement_failed' }));
    return value;
  } catch (e) {
    if (preTransportFailure(e)) {
      await releaseDispatch({ userId: input.userId, attemptKey: reserved.attemptKey, externalAttemptStarted: false }).catch(() => undefined);
    } else {
      await holdDispatch({ userId: input.userId, attemptKey: reserved.attemptKey, uncertainty: uncertaintyOf(e) }).catch(() => undefined);
    }
    throw e;
  }
}

export { DispatchBlockedError };
