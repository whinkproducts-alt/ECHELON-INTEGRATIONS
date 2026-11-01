/** Official X API v2 client. Never logs tokens or response bodies. No scraping, no browser automation. */
export const X_API = 'https://api.x.com/2';
export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_OUTPUT_CHARS = 32 * 1024;
const X_ID = /^[0-9]{1,19}$/;

export interface Credential {
  accessToken: string;
  platformUserId?: string;
}

export interface ToolResult {
  isError: boolean;
  body: unknown;
}

const ok = (body: unknown): ToolResult => ({ isError: false, body });
const fail = (body: unknown): ToolResult => ({ isError: true, body });
export const invalidInput = (field: string): ToolResult => fail({ error: 'invalid_input', field });

/** Parse the credential JSON from _meta. Returns null for anything missing or malformed. */
export function parseCredential(raw: unknown): Credential | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 8192) return null;
  try {
    const v = JSON.parse(raw) as { access_token?: unknown; platform_user_id?: unknown };
    if (typeof v.access_token !== 'string' || v.access_token.length === 0) return null;
    // Header-safe: reject control characters so a token cannot smuggle extra headers.
    if (!/^[\x21-\x7e]+$/.test(v.access_token)) return null;
    const uid = typeof v.platform_user_id === 'string' ? v.platform_user_id : undefined;
    return { accessToken: v.access_token, platformUserId: uid };
  } catch {
    return null;
  }
}

function checkId(v: unknown, field: string): string | ToolResult {
  return typeof v === 'string' && X_ID.test(v) ? v : invalidInput(field);
}
function checkText(v: unknown, field: string, max: number): string | ToolResult {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v : invalidInput(field);
}
function checkMax(v: unknown): number | ToolResult {
  if (v === undefined) return 10;
  return typeof v === 'number' && Number.isInteger(v) && v >= 5 && v <= 100 ? v : invalidInput('max_results');
}
const isResult = (v: unknown): v is ToolResult => typeof v === 'object' && v !== null && 'isError' in v;

async function call(method: string, path: string, token: string, body?: unknown): Promise<ToolResult & { json?: Record<string, unknown> }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${X_API}${path}`, {
      method,
      redirect: 'error',
      signal: ctl.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return { ...fail({ error: 'platform_error', status: res.status }) };
    let json: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(await res.text());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) json = parsed as Record<string, unknown>;
    } catch {
      return { ...fail({ error: 'platform_error', status: res.status }) };
    }
    return { ...ok(null), json };
  } catch {
    // Timeouts, DNS and TLS failures: status 0, never the error message.
    return { ...fail({ error: 'platform_error', status: 0 }) };
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
function pick<T extends string>(o: unknown, keys: readonly T[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (o && typeof o === 'object') for (const k of keys) { const s = str((o as Record<string, unknown>)[k]); if (s !== undefined) out[k] = s; }
  return out;
}
const dataArray = (j: Record<string, unknown>): unknown[] => (Array.isArray(j.data) ? j.data : []);

/** Cap a list result so the JSON stays under the output limit. */
export function capList(key: string, items: unknown[]): unknown {
  let n = items.length;
  let out: Record<string, unknown> = { [key]: items };
  while (n > 0 && JSON.stringify(out).length > MAX_OUTPUT_CHARS) {
    n = Math.floor(n / 2);
    out = { [key]: items.slice(0, n), truncated: true };
  }
  return out;
}

const TWEET_FIELDS = 'id,text,author_id,created_at,conversation_id';

export async function runX(tool: string, args: Record<string, unknown>, cred: Credential): Promise<ToolResult> {
  const uid = cred.platformUserId;
  if (!uid || !X_ID.test(uid)) return fail({ error: 'not_connected', platform: 'x' });
  const t = cred.accessToken;
  switch (tool) {
    case 'read_home_timeline':
    case 'read_mentions': {
      const n = checkMax(args.max_results);
      if (isResult(n)) return n;
      const seg = tool === 'read_mentions' ? 'mentions' : 'timelines/reverse_chronological';
      const r = await call('GET', `/users/${uid}/${seg}?max_results=${n}&tweet.fields=${TWEET_FIELDS}`, t);
      if (!r.json) return r;
      return ok(capList('posts', dataArray(r.json).map((p) => pick(p, ['id', 'text', 'author_id', 'created_at', 'conversation_id'] as const))));
    }
    case 'read_dms': {
      const n = checkMax(args.max_results);
      if (isResult(n)) return n;
      const r = await call('GET', `/dm_events?max_results=${n}&event_types=MessageCreate&dm_event.fields=id,text,sender_id,created_at,event_type`, t);
      if (!r.json) return r;
      return ok(capList('messages', dataArray(r.json).map((p) => pick(p, ['id', 'text', 'sender_id', 'created_at'] as const))));
    }
    case 'post':
    case 'reply': {
      const text = checkText(args.text, 'text', 280);
      if (isResult(text)) return text;
      const body: Record<string, unknown> = { text };
      if (tool === 'reply') {
        const id = checkId(args.in_reply_to_id, 'in_reply_to_id');
        if (isResult(id)) return id;
        body.reply = { in_reply_to_tweet_id: id };
      }
      const r = await call('POST', '/tweets', t, body);
      if (!r.json) return r;
      return ok(pick(r.json.data, ['id', 'text'] as const));
    }
    case 'send_dm': {
      const rid = checkId(args.recipient_id, 'recipient_id');
      if (isResult(rid)) return rid;
      const text = checkText(args.text, 'text', 10000);
      if (isResult(text)) return text;
      const r = await call('POST', `/dm_conversations/with/${rid}/messages`, t, { text });
      if (!r.json) return r;
      return ok(pick(r.json.data, ['dm_event_id', 'dm_conversation_id'] as const));
    }
    case 'follow':
    case 'unfollow': {
      const target = checkId(args.target_user_id, 'target_user_id');
      if (isResult(target)) return target;
      const r = tool === 'follow'
        ? await call('POST', `/users/${uid}/following`, t, { target_user_id: target })
        : await call('DELETE', `/users/${uid}/following/${target}`, t);
      if (!r.json) return r;
      const d = (r.json.data ?? {}) as Record<string, unknown>;
      return ok({ following: d.following === true, ...(tool === 'follow' ? { pending_follow: d.pending_follow === true } : {}) });
    }
    case 'delete_post': {
      const id = checkId(args.post_id, 'post_id');
      if (isResult(id)) return id;
      const r = await call('DELETE', `/tweets/${id}`, t);
      if (!r.json) return r;
      return ok({ deleted: ((r.json.data ?? {}) as Record<string, unknown>).deleted === true });
    }
    default:
      return fail({ error: 'unknown_tool' });
  }
}
