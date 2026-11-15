/**
 * OmniRoute (a local OpenAI-compatible gateway that forwards to many providers) as one model choice.
 * A model id `omniroute/<id>` is sent to OMNIROUTE_BASE_URL with OMNIROUTE_API_KEY and the prefix removed.
 * OmniRoute listens on localhost but forwards off the machine, so it is never treated as local: Local-Only and
 * lockdown refuse it, and its cost class is unknown (blocked) until the operator states it is free.
 */
export const OMNIROUTE_PREFIX = 'omniroute/';
export const OMNIROUTE_DEFAULT_URL = 'http://localhost:20128/v1';

type Env = Record<string, string | undefined>;

export function isOmniRouteModel(model: string | null | undefined): boolean {
  return typeof model === 'string' && model.startsWith(OMNIROUTE_PREFIX) && model.length > OMNIROUTE_PREFIX.length;
}

export function omniRouteBaseUrl(env: Env = process.env): string {
  return (env.OMNIROUTE_BASE_URL?.trim() || OMNIROUTE_DEFAULT_URL).replace(/\/$/, '');
}

export function omniRouteConfigured(env: Env = process.env): boolean {
  return Boolean(env.OMNIROUTE_API_KEY?.trim());
}

export interface OmniRouteTarget { baseUrl: string; apiKey: string; model: string }

/** The endpoint, key and bare model id for an `omniroute/` model, or null for any other model. */
export function resolveOmniRoute(model: string, env: Env = process.env): OmniRouteTarget | null {
  if (!isOmniRouteModel(model)) return null;
  const apiKey = env.OMNIROUTE_API_KEY?.trim();
  if (!apiKey) throw new Error('OmniRoute is not configured: set OMNIROUTE_API_KEY.');
  return { baseUrl: omniRouteBaseUrl(env), apiKey, model: model.slice(OMNIROUTE_PREFIX.length) };
}
