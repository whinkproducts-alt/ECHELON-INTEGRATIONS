/**
 * Qwen OAuth: Victor pastes the login JSON once (access_token, refresh_token, expiry_date). It is stored encrypted
 * (user_api_keys, provider `model:qwen-oauth`). ECHELON never reads another tool's credential file and never sees a
 * password. Refresh needs QWEN_OAUTH_TOKEN_URL (https) and QWEN_OAUTH_CLIENT_ID from the operator: no default is guessed.
 */
import { prisma } from '@/lib/db';
import { decryptKey, encryptKey, keyHint } from '@/lib/key-encryption';
import { recordActionSafe } from '@/lib/ledger';
import { storedKeyName } from './provider-catalog';

const NAME = storedKeyName('qwen-oauth');
const SKEW_MS = 60_000;

export interface QwenLogin { access_token: string; refresh_token: string; expiry_date: number }

export function parseQwenLogin(raw: unknown): QwenLogin | null {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { return null; } }
  if (typeof o !== 'object' || o === null) return null;
  const r = o as Record<string, unknown>;
  if (typeof r.access_token !== 'string' || !r.access_token || typeof r.refresh_token !== 'string' || !r.refresh_token) return null;
  const exp = Number(r.expiry_date);
  if (!Number.isFinite(exp) || exp <= 0) return null;
  return { access_token: r.access_token, refresh_token: r.refresh_token, expiry_date: exp };
}

async function save(userId: string, l: QwenLogin): Promise<void> {
  const encryptedKey = encryptKey(JSON.stringify(l));
  const data = { encryptedKey, keyHint: keyHint(l.access_token) };
  await prisma.userApiKey.upsert({ where: { userId_provider: { userId, provider: NAME } }, create: { userId, provider: NAME, ...data }, update: data });
}

export async function importQwenLogin(userId: string, raw: unknown): Promise<{ ok: boolean }> {
  const l = parseQwenLogin(raw);
  if (!l) return { ok: false };
  await save(userId, l);
  await recordActionSafe({ userId, initiator: 'user', action: 'model_login_imported', tool: 'qwen-oauth', permissionClass: 'A', status: 'EXECUTED', inputSummary: 'provider=qwen-oauth (no token in this row)' });
  return { ok: true };
}

export async function getQwenAccessToken(userId: string, opts: { env?: Record<string, string | undefined>; now?: number; fetchImpl?: typeof fetch } = {}): Promise<string | null> {
  const env = opts.env ?? process.env;
  const row = await prisma.userApiKey.findUnique({ where: { userId_provider: { userId, provider: NAME } } });
  if (!row) return null;
  let l: QwenLogin | null;
  try { l = parseQwenLogin(decryptKey(row.encryptedKey)); } catch { return null; }
  if (!l) return null;
  if (l.expiry_date - SKEW_MS > (opts.now ?? Date.now())) return l.access_token;
  const url = env.QWEN_OAUTH_TOKEN_URL?.trim(), client = env.QWEN_OAUTH_CLIENT_ID?.trim();
  if (!url || !client || !url.startsWith('https://')) return null;
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: l.refresh_token, client_id: client }).toString(),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!j.access_token || !Number.isFinite(j.expires_in)) return null;
    const next: QwenLogin = { access_token: j.access_token, refresh_token: j.refresh_token || l.refresh_token, expiry_date: (opts.now ?? Date.now()) + Number(j.expires_in) * 1000 };
    await save(userId, next);
    await recordActionSafe({ userId, initiator: 'system', action: 'model_login_refreshed', tool: 'qwen-oauth', permissionClass: 'A', status: 'EXECUTED', inputSummary: 'provider=qwen-oauth' });
    return next.access_token;
  } catch { return null; }
}
