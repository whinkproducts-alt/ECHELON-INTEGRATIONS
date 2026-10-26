/**
 * Which models a signed-in user may ask for. The chat route takes `model` from the request body, so without
 * a check any user could pick the most expensive model on the operator's own provider key.
 *
 * A requested model is allowed when it is on the allow-list, or when the user has stored their own key for
 * that model's provider (then the cost is theirs). Anything else falls back to the operator's default.
 *
 * WHINK_ALLOWED_MODELS (comma separated) replaces the built-in list. The built-in list is the set the
 * model picker in the chat screen offers, plus DEFAULT_MODEL and WHINK_LOCAL_MODEL when they are set.
 */
export const DEFAULT_SELECTABLE_MODELS: readonly string[] = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5',
  'claude-opus-5-5',
  'gpt-4o',
  'llama3.1:8b',
];

type EnvMap = Record<string, string | undefined>;

const MODEL_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

export function isModelNameShape(model: unknown): model is string {
  return typeof model === 'string' && MODEL_SHAPE.test(model);
}

export function allowedModelSet(env: EnvMap = process.env): Set<string> {
  const configured = (env.WHINK_ALLOWED_MODELS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length > 0) return new Set(configured);
  const set = new Set<string>(DEFAULT_SELECTABLE_MODELS);
  for (const m of [env.DEFAULT_MODEL, env.WHINK_LOCAL_MODEL]) if (m?.trim()) set.add(m.trim());
  return set;
}

/** Provider whose stored user key would pay for this model, or null when none applies. */
export function byokProviderFor(model: string): 'anthropic' | 'openai' | null {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  return null;
}

export function isModelAllowed(model: string, opts: { hasOwnKey: boolean; env?: EnvMap }): boolean {
  if (!isModelNameShape(model)) return false;
  if (opts.hasOwnKey) return true;
  return allowedModelSet(opts.env).has(model);
}
