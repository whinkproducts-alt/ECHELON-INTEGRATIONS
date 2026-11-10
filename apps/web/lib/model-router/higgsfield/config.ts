/** Credentials are server-only and explicitly bound to one account. Never serialize this object. */
export const HIGGSFIELD_ORIGIN = 'https://api.higgsfield.ai';
export function mediaConfig(userId: string, env: Record<string, string | undefined> = process.env) {
  if (env.HIGGSFIELD_ENABLED !== 'true') throw new Error('MEDIA_DISABLED');
  if (!userId || env.HIGGSFIELD_ACCOUNT_USER_ID !== userId) throw new Error('MEDIA_NOT_CONFIGURED');
  const keyId = env.HIGGSFIELD_KEY_ID?.trim();
  const secret = env.HIGGSFIELD_KEY_SECRET?.trim();
  if (!keyId || !secret || !/^[A-Za-z0-9_-]{1,160}$/.test(keyId) || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) throw new Error('MEDIA_NOT_CONFIGURED');
  return { keyId, secret };
}
export function mediaReadiness(userId: string) {
  let configured = false;
  try { mediaConfig(userId); configured = true; } catch { /* never disclose other accounts or key material */ }
  const localOnly = process.env.WHINK_LOCAL_ONLY === 'true';
  const paidEnabled = process.env.WHINK_PAID_MODELS_ENABLED === 'true';
  const rawCap = process.env.WHINK_MONTHLY_SPEND_MICROS ?? '';
  const spendCap = /^[1-9][0-9]*$/.test(rawCap) && Number.isSafeInteger(Number(rawCap));
  const quoteReady = configured && !localOnly;
  const generationReady = quoteReady && paidEnabled && spendCap;
  const blocker = !configured ? 'MEDIA_NOT_CONFIGURED' : localOnly ? 'LOCAL_ONLY' : !paidEnabled ? 'PAID_NOT_ADMITTED' : !spendCap ? 'SPEND_CAP_UNSET' : null;
  return { configured, quoteReady, generationReady, blocker,
    message: !configured ? 'Configure account-bound provider credentials on the server.' : localOnly ? 'Cloud media is disabled in Local-Only mode.' : !generationReady ? 'Provider configured. A protected quote can be requested; generation also needs paid admission and a monthly spend cap.' : 'Provider configured. Request a protected quote, then approve the exact priced generation request.' };
}
