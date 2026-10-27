/**
 * Meeting rooms on the owner's OWN self-hosted provider (for example Jitsi Meet).
 * MEETING_PROVIDER_BASE_URL must be https, or http on localhost. With nothing configured this
 * returns not_configured and makes no network call at all: no public service is ever contacted,
 * and creating a room is just minting an unguessable URL on the configured host.
 */
import { randomBytes } from 'node:crypto';

export type RoomResult =
  | { url: string; provider: string }
  | { url: null; reason: 'not_configured' | 'invalid_config' };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function providerBase(raw: string | undefined = process.env.MEETING_PROVIDER_BASE_URL): URL | null | 'invalid' {
  const v = (raw ?? '').trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(v); } catch { return 'invalid'; }
  if (u.username || u.password || u.search || u.hash) return 'invalid';
  const local = LOCAL_HOSTS.has(u.hostname);
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) return 'invalid';
  return u;
}

/** 160 random bits as hex. Not derived from any user input. */
export function newRoomName(): string {
  return randomBytes(20).toString('hex');
}

export function createRoom(env: Record<string, string | undefined> = process.env): RoomResult {
  const base = providerBase(env.MEETING_PROVIDER_BASE_URL);
  if (base === null) return { url: null, reason: 'not_configured' };
  if (base === 'invalid') return { url: null, reason: 'invalid_config' };
  const path = base.pathname.replace(/\/+$/, '');
  return { url: `${base.origin}${path}/${newRoomName()}`, provider: base.hostname };
}
