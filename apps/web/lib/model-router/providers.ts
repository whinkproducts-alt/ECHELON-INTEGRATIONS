/**
 * Config-only OpenAI-compatible cloud providers (backlog Part 2, lane C1).
 *
 * Adding a provider is one row here. Nothing is called unless: Local-Only and lockdown are off, the spend envelope
 * is on and admission allows the reservation, a key exists (env or encrypted settings), and the price is known.
 * Prices are never invented: they come from WHINK_MODEL_PRICES keyed `<providerId>/<model>` (USD micros per token,
 * the existing format read by estimateCostMicros). No entry means UNKNOWN_PRICE and the call is refused.
 * Base URLs are the providers' published defaults and can be overridden per provider by env; verify on first live use.
 */
import { decryptKey } from '@/lib/key-encryption';
import { prisma } from '@/lib/db';
import { isLocalOnlyMode, redirectOpt } from '@/lib/local-only';
import { estimateCostMicros } from '@/lib/usage';
import { admittedCall, type AdmissionScope } from './dispatch';
import { conservativeTokens } from './admission';
import { priceKey, priceKnown, providerBaseUrl, providerEnvKey, providerModel, providerSpec, storedKeyName, type ProviderSpec } from './provider-catalog';

type Env = Record<string, string | undefined>;

/** Stored keys live in user_api_keys under provider `model:<id>`, AES-256-GCM via key-encryption. */

export async function storedProviderIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.userApiKey.findMany({ where: { userId, provider: { startsWith: 'model:' } }, select: { provider: true } });
  return new Set(rows.map((r) => r.provider.slice('model:'.length)));
}

/** Env first, then the user's encrypted setting. Never returns a key for another provider. */
export async function resolveProviderKey(userId: string, p: ProviderSpec, env: Env = process.env, qwenToken?: (userId: string) => Promise<string | null>): Promise<string | null> {
  if (p.id === 'qwen-oauth') return qwenToken ? qwenToken(userId) : null;
  const e = providerEnvKey(p, env);
  if (e) return e;
  const row = await prisma.userApiKey.findUnique({ where: { userId_provider: { userId, provider: storedKeyName(p.id) } } });
  return row ? decryptKey(row.encryptedKey) : null;
}

export class ProviderRefusedError extends Error {
  constructor(readonly code: 'LOCAL_ONLY' | 'NO_KEY' | 'NO_BASE_URL' | 'UNKNOWN_PRICE') { super(code); this.name = 'ProviderRefusedError'; }
}

export interface ProviderChatInput {
  userId: string;
  providerId: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  env?: Env;
  /** Injected for Qwen OAuth (see qwen-oauth.ts). */
  qwenToken?: (userId: string) => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

/** Admission scope for a paid provider call. Metered and priced, or the dispatcher refuses it. */
export function providerScope(p: ProviderSpec, model: string, userId: string, inputChars: number, maxTokens: number, env: Env = process.env): AdmissionScope {
  const tokens = conservativeTokens(inputChars, maxTokens);
  const micros = estimateCostMicros(priceKey(p.id, model), tokens, 0, env.WHINK_MODEL_PRICES);
  return {
    userId, purpose: 'chat', model: priceKey(p.id, model), provider: p.id, kind: 'chat', baseUrl: providerBaseUrl(p, env) ?? undefined,
    maxTokens, inputChars, costClass: 'metered', priceKnown: micros != null, reservedMicros: micros ?? 0, reservedTokens: tokens,
  };
}

export async function providerChatOnce(i: ProviderChatInput): Promise<string> {
  const env = i.env ?? process.env;
  const p = providerSpec(i.providerId);
  if (!p) throw new Error(`unknown provider ${i.providerId}`);
  if (isLocalOnlyMode(env as NodeJS.ProcessEnv)) throw new ProviderRefusedError('LOCAL_ONLY'); // before any key lookup or network
  const base = providerBaseUrl(p, env);
  if (!base) throw new ProviderRefusedError('NO_BASE_URL');
  const model = i.model ?? providerModel(p, env);
  if (!priceKnown(p.id, model, env)) throw new ProviderRefusedError('UNKNOWN_PRICE');
  const key = await resolveProviderKey(i.userId, p, env, i.qwenToken);
  if (!key) throw new ProviderRefusedError('NO_KEY');
  const maxTokens = i.maxTokens ?? 512;
  const inputChars = i.messages.reduce((n, m) => n + m.content.length, 0);
  const doFetch = i.fetchImpl ?? fetch;
  return admittedCall(
    providerScope(p, model, i.userId, inputChars, maxTokens, env),
    async () => {
      const res = await doFetch(`${base}/chat/completions`, {
        method: 'POST', signal: i.signal, ...redirectOpt(base),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: i.messages, stream: false, max_tokens: maxTokens, temperature: i.temperature ?? 0 }),
      });
      if (!res.ok) throw new Error(`${p.id} error ${res.status}`); // body omitted: it may echo the key
      const json = await res.json();
      return String(json?.choices?.[0]?.message?.content ?? '');
    },
    (text) => ({ tokensIn: Math.ceil(inputChars / 4), tokensOut: Math.ceil(text.length / 4), basis: 'estimated', model: priceKey(p.id, model) }),
  );
}
