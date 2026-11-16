/**
 * Per-channel inbound parsers and verifiers. Pure functions: credentials come from the env passed in, never from code.
 * Each returns null for anything that is not a plain inbound message from another person (bots, echoes, pings, bad auth).
 * Transports (the web route, the IMAP poll, the bridge process) call these then handleInbound.
 */
import { createHmac, createPublicKey, verify } from 'node:crypto';
import { safeEqual, type InboundMessage } from './inbound';

type Env = Record<string, string | undefined>;
type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const make = (channel: string, senderId: string, text: string): InboundMessage | null => (senderId && text.trim() ? { channel, senderId, text } : null);
const bearer = (header: string | null | undefined, token: string | undefined) => !!token && safeEqual(str(header).replace(/^Bearer /, ''), token);

/** IMAP: the poller gives one fetched message. Sender is the lowercased From address. Mail from our own address is ignored. */
export function parseImap(msg: { from?: string; text?: string; subject?: string }, env: Env): InboundMessage | null {
  const addr = str(msg.from).match(/<([^>]+)>/)?.[1] ?? str(msg.from).trim();
  const from = addr.toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(from) || from === env.IMAP_USER?.toLowerCase()) return null;
  return make('email', from, `${str(msg.subject)}\n${str(msg.text)}`);
}

/** Slack Events API: HMAC v0 signature with a 5 minute replay window. Bot messages are ignored. */
export function parseSlack(raw: string, h: { signature?: string | null; timestamp?: string | null }, env: Env, now = Date.now()): InboundMessage | null {
  const secret = env.SLACK_SIGNING_SECRET;
  const ts = Number(h.timestamp);
  if (!secret || !Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return null;
  if (!safeEqual(str(h.signature), 'v0=' + createHmac('sha256', secret).update(`v0:${h.timestamp}:${raw}`).digest('hex'))) return null;
  const e = JSON.parse(raw)?.event as Obj | undefined;
  if (!e || e.type !== 'message' || e.bot_id || e.subtype) return null;
  return make('slack', str(e.user), str(e.text));
}

/** Discord interactions endpoint: Ed25519 over timestamp+body. Type 1 pings and non-command interactions are ignored. */
export function parseDiscord(raw: string, h: { signature?: string | null; timestamp?: string | null }, env: Env): InboundMessage | null {
  const pub = env.DISCORD_PUBLIC_KEY;
  if (!pub || !/^[0-9a-f]{64}$/i.test(pub) || !/^[0-9a-f]{128}$/i.test(str(h.signature))) return null;
  const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub, 'hex')]), format: 'der', type: 'spki' });
  if (!verify(null, Buffer.from(str(h.timestamp) + raw), key, Buffer.from(str(h.signature), 'hex'))) return null;
  const i = JSON.parse(raw) as Obj;
  if (i.type !== 2) return null;
  return make('discord', str(i.member?.user?.id ?? i.user?.id), str(i.data?.options?.[0]?.value));
}
// shortcut: Teams and Google Chat sign with a Microsoft/Google JWT; here a relay bearer token (env) guards the endpoint. Upgrade to full JWT/JWKS validation before exposing these publicly.
export function parseTeams(body: Obj, authHeader: string | null, env: Env): InboundMessage | null {
  if (!bearer(authHeader, env.TEAMS_INBOUND_TOKEN) || body?.type !== 'message') return null;
  return make('teams', str(body.from?.aadObjectId ?? body.from?.id), str(body.text));
}
export function parseGoogleChat(body: Obj, authHeader: string | null, env: Env): InboundMessage | null {
  if (!bearer(authHeader, env.GOOGLE_CHAT_INBOUND_TOKEN) || body?.type !== 'MESSAGE' || body.message?.sender?.type === 'BOT') return null;
  return make('google_chat', str(body.message?.sender?.name), str(body.message?.text));
}

/**
 * WhatsApp through an UNOFFICIAL Baileys-style bridge. Off until WHATSAPP_BRIDGE_TOKEN is set. The bridge is not endorsed
 * by WhatsApp and the number can be banned: use a dedicated number. Replies are never sent from here (Class C approval).
 */
export function parseWhatsAppBridge(body: Obj, authHeader: string | null, env: Env): InboundMessage | null {
  if (!bearer(authHeader, env.WHATSAPP_BRIDGE_TOKEN) || body?.fromMe || body?.isGroup) return null;
  return make('whatsapp', str(body.from).replace(/@.*$/, ''), str(body.body));
}

/** iMessage through a Mac-side bridge reading Messages. Off until IMESSAGE_BRIDGE_TOKEN is set. */
export function parseIMessageBridge(body: Obj, authHeader: string | null, env: Env): InboundMessage | null {
  if (!bearer(authHeader, env.IMESSAGE_BRIDGE_TOKEN) || body?.isFromMe) return null;
  return make('imessage', str(body.handle), str(body.text));
}
