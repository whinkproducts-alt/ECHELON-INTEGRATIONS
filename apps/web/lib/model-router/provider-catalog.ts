/**
 * Config-only OpenAI-compatible cloud providers (backlog Part 2, lane C1).
 *
 * Adding a provider is one row here. Nothing is called unless: Local-Only and lockdown are off, the spend envelope
 * is on and admission allows the reservation, a key exists (env or encrypted settings), and the price is known.
 * Prices are never invented: they come from WHINK_MODEL_PRICES keyed `<providerId>/<model>` (USD micros per token,
 * the existing format read by estimateCostMicros). No entry means UNKNOWN_PRICE and the call is refused.
 * Base URLs are the providers' published defaults and can be overridden per provider by env; verify on first live use.
 */
import { estimateCostMicros } from '@/lib/usage';

type Env = Record<string, string | undefined>;

export interface ProviderSpec {
  id: string;
  label: string;
  /** Default base URL of the OpenAI-compatible API. Null: the operator must set `<ENV>_BASE_URL`. */
  baseUrl: string | null;
  /** Env prefix: `<ENV>_API_KEY`, `<ENV>_BASE_URL`, `<ENV>_MODEL`. */
  env: string;
  defaultModel: string;
  tools: boolean;
  note?: string;
}

export const PROVIDERS: readonly ProviderSpec[] = [
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', env: 'OPENROUTER', defaultModel: 'openrouter/auto', tools: true },
  { id: 'fireworks', label: 'Fireworks', baseUrl: 'https://api.fireworks.ai/inference/v1', env: 'FIREWORKS', defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct', tools: true },
  { id: 'novita', label: 'Novita', baseUrl: 'https://api.novita.ai/v3/openai', env: 'NOVITA', defaultModel: 'meta-llama/llama-3.3-70b-instruct', tools: true },
  { id: 'deepinfra', label: 'DeepInfra', baseUrl: 'https://api.deepinfra.com/v1/openai', env: 'DEEPINFRA', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct', tools: true },
  { id: 'huggingface', label: 'Hugging Face', baseUrl: 'https://router.huggingface.co/v1', env: 'HUGGINGFACE', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct', tools: true },
  { id: 'moonshot', label: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.ai/v1', env: 'MOONSHOT', defaultModel: 'kimi-k2-0905-preview', tools: true },
  { id: 'zai', label: 'z.ai (GLM)', baseUrl: 'https://api.z.ai/api/paas/v4', env: 'ZAI', defaultModel: 'glm-4.6', tools: true },
  { id: 'minimax', label: 'MiniMax', baseUrl: 'https://api.minimax.io/v1', env: 'MINIMAX', defaultModel: 'MiniMax-M2', tools: true },
  { id: 'nebius', label: 'Nebius', baseUrl: 'https://api.studio.nebius.com/v1', env: 'NEBIUS', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct', tools: true },
  { id: 'upstage', label: 'Upstage', baseUrl: 'https://api.upstage.ai/v1', env: 'UPSTAGE', defaultModel: 'solar-pro2', tools: true },
  { id: 'ramp', label: 'Ramp Router', baseUrl: null, env: 'RAMP', defaultModel: 'auto', tools: false, note: 'No published base URL known: set RAMP_BASE_URL.' },
  { id: 'tencent', label: 'Tencent TokenHub', baseUrl: null, env: 'TENCENT_TOKENHUB', defaultModel: 'auto', tools: false, note: 'No published base URL known: set TENCENT_TOKENHUB_BASE_URL.' },
  { id: 'opencode-zen', label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', env: 'OPENCODE_ZEN', defaultModel: 'auto', tools: true },
  { id: 'opencode-go', label: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1', env: 'OPENCODE_GO', defaultModel: 'auto', tools: true },
  { id: 'arcee', label: 'Arcee', baseUrl: 'https://api.arcee.ai/api/v1', env: 'ARCEE', defaultModel: 'trinity-large', tools: true },
  { id: 'mimo', label: 'Xiaomi MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', env: 'MIMO', defaultModel: 'mimo-v2-flash', tools: true },
  { id: 'ollama-cloud', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', env: 'OLLAMA_CLOUD', defaultModel: 'gpt-oss:120b', tools: true, note: 'Not local: never for founder-private data.' },
  { id: 'qwen-oauth', label: 'Qwen (OAuth login)', baseUrl: 'https://portal.qwen.ai/v1', env: 'QWEN', defaultModel: 'qwen3-coder-plus', tools: true, note: 'Login imported once into encrypted settings.' },
];

export const providerSpec = (id: string) => PROVIDERS.find((p) => p.id === id);
const has = (env: Env, k: string) => Boolean(env[k]?.trim());

export function providerBaseUrl(p: ProviderSpec, env: Env = process.env): string | null {
  const o = env[`${p.env}_BASE_URL`]?.trim();
  return (o || p.baseUrl)?.replace(/\/$/, '') ?? null;
}
export const providerModel = (p: ProviderSpec, env: Env = process.env) => env[`${p.env}_MODEL`]?.trim() || p.defaultModel;
/** Price key and lookup: `<providerId>/<model>` in WHINK_MODEL_PRICES. Null = unknown price, so refused. */
export const priceKey = (providerId: string, model: string) => `${providerId}/${model}`;
export function priceKnown(providerId: string, model: string, env: Env = process.env): boolean {
  return estimateCostMicros(priceKey(providerId, model), 1, 0, env.WHINK_MODEL_PRICES) != null;
}

/** Env key presence (stored keys are checked by resolveProviderKey). Qwen OAuth is stored only. */
export function providerEnvKey(p: ProviderSpec, env: Env = process.env): string | null {
  return p.id === 'qwen-oauth' ? null : env[`${p.env}_API_KEY`]?.trim() || null;
}
export const providerEnvConfigured = (p: ProviderSpec, env: Env = process.env) => has(env, `${p.env}_API_KEY`);

export const storedKeyName = (id: string) => `model:${id}`;
