// DEV ONLY. Fake answers for the password routes so the forgot/reset forms can be previewed in every state.
// ready: 200 ok. loading: never answers. error: reset token expired / forgot rate limited. empty: weak password.
import type { Mocked, MockCtx } from './fixtures';

export function answerLanding(method: string, url: URL, _body: unknown, ctx: MockCtx): Mocked | null {
  if (method !== 'POST') return null;
  const p = url.pathname;
  if (p !== '/api/auth/password/forgot' && p !== '/api/auth/password/reset') return null;
  if (ctx.state === 'loading') return { status: 200, body: {}, delayMs: 600_000 };
  if (p === '/api/auth/password/forgot') return ctx.state === 'error' ? { status: 429, body: { error: 'rate_limited' } } : { status: 200, body: { ok: true } };
  if (ctx.state === 'error') return { status: 400, body: { error: 'invalid_or_expired' } };
  if (ctx.state === 'empty') return { status: 400, body: { error: 'weak_password' } };
  return { status: 200, body: { ok: true } };
}
