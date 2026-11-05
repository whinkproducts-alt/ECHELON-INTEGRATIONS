/**
 * Model selection reads process.env, and importing a route pulls in Next's env loader, which
 * loads apps/web/.env.local into the test process. On a developer machine that file names a
 * local model, so assertions that expect a clean default ("no model configured", the literal
 * fallback) fail locally while CI stays green. Clear the model keys before every test.
 *
 * A test that needs one of these sets it in its own beforeEach, which runs after this hook.
 */
import { beforeEach } from 'vitest';

const MODEL_KEYS = [
  'DEFAULT_MODEL',
  'WHINK_LOCAL_MODEL',
  'WHINK_LOCAL_ONLY',
  'WHINK_ALLOWED_MODELS',
  'WHINK_PAID_MODELS_ENABLED',
] as const;

beforeEach(() => {
  for (const key of MODEL_KEYS) delete process.env[key];
});
