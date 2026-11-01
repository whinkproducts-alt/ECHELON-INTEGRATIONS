/**
 * Local-Only mode (WHINK_LOCAL_ONLY === 'true'): model calls may go only to a model served from this
 * machine. Pure module (env reads only) so callers and tests can import it without the router.
 *
 * Refused: claude* and gemini* models, a per-user BYOK key, and any endpoint whose hostname is not an
 * exact loopback name (localhost, 127.x.x.x, ::1). Lookalikes such as localhost.evil.com or
 * 127.0.0.1.evil.com fail because the whole hostname is compared, never a prefix.
 * The router enforces this in streamChat, chatOnce, chatWithTools and embed.
 */

export class LocalOnlyViolationError extends Error {
  constructor(reason: string) {
    super(`Local-Only mode: ${reason}`);
    this.name = 'LocalOnlyViolationError';
  }
}

export function isLocalOnlyMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WHINK_LOCAL_ONLY === 'true';
}

/** Exact loopback hostname check on a URL string. http(s) only. */
export function isLoopbackUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}

const DEFAULT_OPENAI_BASE = 'http://localhost:11434/v1';

export function localModelNameForLocalOnly(env: NodeJS.ProcessEnv = process.env): string {
  return env.WHINK_LOCAL_MODEL?.trim() || 'wink-qwen3.5-9b-8k';
}

/** Why a call would leave the machine, or null when it would not. */
export function localOnlyViolation(model: string, opts: { apiKey?: string; baseUrl?: string } = {}, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isLocalOnlyMode(env)) return null;
  const lower = (model ?? '').trim().toLowerCase();
  if (lower.startsWith('claude') || lower.startsWith('gemini')) return `model ${lower.slice(0, 40)} is a cloud model`;
  if (opts.apiKey) return 'a per-user API key may not be used';
  const targets = opts.baseUrl ? [opts.baseUrl] : [env.OPENAI_COMPATIBLE_BASE_URL || DEFAULT_OPENAI_BASE];
  if (!opts.baseUrl && env.OLLAMA_URL) targets.push(env.OLLAMA_URL);
  for (const t of targets) if (!isLoopbackUrl(t)) return 'the model endpoint is not a loopback address';
  return null;
}

export function assertLocalOnly(model: string, opts: { apiKey?: string; baseUrl?: string } = {}): void {
  const v = localOnlyViolation(model, opts);
  if (v) throw new LocalOnlyViolationError(v);
}

/** The model unchanged, or in Local-Only mode the local model when the given one would leave the machine. */
export function localOnlyModel<T extends string | null | undefined>(model: T): T | string {
  if (!isLocalOnlyMode()) return model;
  if (!model || localOnlyViolation(model)) return localModelNameForLocalOnly();
  return model;
}

export const LOCAL_ONLY_UNAVAILABLE = 'Not available in Local-Only mode';
export const SPEECH_UNAVAILABLE = 'Speech is not available in Local-Only mode';

/**
 * fetch option for redirects. A redirect must not forward a request body to another host, so Local-Only mode and
 * loopback targets refuse them; ordinary cloud endpoints and proxies keep the default behaviour.
 */
export function redirectOpt(url: string | null | undefined, env: NodeJS.ProcessEnv = process.env): { redirect?: 'error' } {
  return isLocalOnlyMode(env) || (!!url && isLoopbackUrl(url)) ? { redirect: 'error' } : {};
}

/** True when Local-Only is on and the URL is missing or not an exact loopback address. */
export function localOnlyBlocksUrl(raw: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isLocalOnlyMode(env)) return false;
  return !raw || !isLoopbackUrl(raw);
}

/** Throws LocalOnlyViolationError when Local-Only is on and the URL is not loopback. */
export function assertLoopbackWhenLocalOnly(raw: string | null | undefined, what: string): void {
  if (localOnlyBlocksUrl(raw)) throw new LocalOnlyViolationError(`${what} is not a loopback address`);
}
