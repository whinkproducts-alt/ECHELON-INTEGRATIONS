import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/db';

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const TICKET_TTL_MS = 60 * 1000;

export const REAUTH_TTL_MS = 5 * 60 * 1000;
export const MAX_OPEN_CHALLENGES = 30;

export type ChallengePurpose = 'register' | 'login' | 'login_ticket' | 'reauth' | 'reauth_ticket';

export interface IssuedChallenge {
  id: string;
  challenge: string;
}

/** Store a one-use challenge. userId is set for registration, null for discoverable login. */
export async function issueChallenge(
  purpose: 'register' | 'login' | 'reauth',
  challenge: string,
  opts: { userId?: string | null; remember?: boolean; clientKey?: string | null; now?: number } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const row = await prisma.passkeyChallenge.create({
    data: {
      userId: opts.userId ?? null,
      challenge,
      purpose,
      remember: opts.remember === true,
      clientKey: opts.clientKey ?? null,
      expiresAt: new Date(now + CHALLENGE_TTL_MS),
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Atomically consume a challenge: one conditional update (unused, right purpose, not expired,
 * right user binding). Two concurrent callers: exactly one wins. Returns the challenge text and
 * remember flag, or null.
 */
export async function consumeChallenge(
  id: string,
  purpose: 'register' | 'login' | 'reauth',
  opts: { userId?: string | null; now?: number } = {},
): Promise<{ challenge: string; remember: boolean } | null> {
  const now = new Date(opts.now ?? Date.now());
  const res = await prisma.passkeyChallenge.updateMany({
    where: {
      id,
      purpose,
      usedAt: null,
      expiresAt: { gt: now },
      ...(purpose !== 'login' ? { userId: opts.userId ?? '__none__' } : { userId: null }),
    },
    data: { usedAt: now },
  });
  if (res.count !== 1) return null;
  const row = await prisma.passkeyChallenge.findUnique({
    where: { id },
    select: { challenge: true, remember: true },
  });
  return row ?? null;
}

function ticketSecret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return s;
}

function sign(id: string): string {
  return createHmac('sha256', ticketSecret()).update(`passkey-ticket:${id}`).digest('base64url');
}

/**
 * Mint a one-time, 60 second, signed login ticket. Only call this after a fully verified
 * assertion (see login/verify). The ticket is `<rowId>.<hmac>`; the row makes it single use.
 */
export async function mintLoginTicket(userId: string, remember: boolean, now: number = Date.now()): Promise<string> {
  const row = await prisma.passkeyChallenge.create({
    data: {
      userId,
      challenge: randomBytes(16).toString('base64url'),
      purpose: 'login_ticket',
      remember,
      expiresAt: new Date(now + TICKET_TTL_MS),
    },
    select: { id: true },
  });
  return `${row.id}.${sign(row.id)}`;
}

/** Verify the signature, then consume the ticket atomically. Returns user and remember flag or null. */
export async function redeemLoginTicket(
  ticket: unknown,
  now: number = Date.now(),
): Promise<{ userId: string; remember: boolean } | null> {
  if (typeof ticket !== 'string' || ticket.length > 200) return null;
  const dot = ticket.indexOf('.');
  if (dot <= 0) return null;
  const id = ticket.slice(0, dot);
  const given = Buffer.from(ticket.slice(dot + 1));
  const want = Buffer.from(sign(id));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const when = new Date(now);
  const res = await prisma.passkeyChallenge.updateMany({
    where: { id, purpose: 'login_ticket', usedAt: null, expiresAt: { gt: when }, userId: { not: null } },
    data: { usedAt: when },
  });
  if (res.count !== 1) return null;
  const row = await prisma.passkeyChallenge.findUnique({ where: { id }, select: { userId: true, remember: true } });
  if (!row?.userId) return null;
  return { userId: row.userId, remember: row.remember };
}

/** True when this client key already holds the maximum number of open (unused, unexpired) challenges. */
export async function tooManyOpenChallenges(
  clientKey: string,
  purpose: 'register' | 'login' | 'reauth',
  now: number = Date.now(),
): Promise<boolean> {
  const n = await prisma.passkeyChallenge.count({
    where: { clientKey, purpose, usedAt: null, expiresAt: { gt: new Date(now) } },
  });
  return n >= MAX_OPEN_CHALLENGES;
}

/** Delete expired and used rows. Exported for the worker; also called opportunistically. */
export async function cleanupPasskeyChallenges(now: number = Date.now()): Promise<number> {
  const when = new Date(now);
  const res = await prisma.passkeyChallenge.deleteMany({
    where: { OR: [{ expiresAt: { lt: when } }, { usedAt: { not: null } }] },
  });
  return res.count;
}

let lastCleanup = 0;
/** At most once a minute per process. Never throws, never blocks the caller on failure. */
export async function maybeCleanupChallenges(now: number = Date.now()): Promise<void> {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  try {
    await cleanupPasskeyChallenges(now);
  } catch {
    /* best effort */
  }
}

/** Short-lived proof of a fresh passkey assertion, bound to one user. Needed to add or remove a passkey. */
export async function mintReauthTicket(userId: string, now: number = Date.now()): Promise<string> {
  const row = await prisma.passkeyChallenge.create({
    data: {
      userId,
      challenge: randomBytes(16).toString('base64url'),
      purpose: 'reauth_ticket',
      expiresAt: new Date(now + REAUTH_TTL_MS),
    },
    select: { id: true },
  });
  return `${row.id}.${sign(row.id)}`;
}

/** Consume a re-auth ticket atomically. It must belong to this user. */
export async function redeemReauthTicket(ticket: unknown, userId: string, now: number = Date.now()): Promise<boolean> {
  if (typeof ticket !== 'string' || ticket.length > 200) return false;
  const dot = ticket.indexOf('.');
  if (dot <= 0) return false;
  const id = ticket.slice(0, dot);
  const given = Buffer.from(ticket.slice(dot + 1));
  const want = Buffer.from(sign(id));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  const when = new Date(now);
  const res = await prisma.passkeyChallenge.updateMany({
    where: { id, purpose: 'reauth_ticket', userId, usedAt: null, expiresAt: { gt: when } },
    data: { usedAt: when },
  });
  return res.count === 1;
}
