import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique } } }));

import { routeRecipient, routingHeaders } from '../comms/mail-routing';
import { deliver } from '../comms/delivery';

const OWN = { senderIsOwner: true };
const CATCH = 'whinkproducts@gmail.com';

describe('routeRecipient', () => {
  it('routes any whinkgroup.com address to the catch-all, case-insensitively', () => {
    for (const a of ['victor.igboekwe@whinkgroup.com', 'Amara.Okafor@WHINKGROUP.COM', ' anyone@whinkgroup.com ']) {
      const r = routeRecipient(a, OWN);
      expect(r).toMatchObject({ valid: true, deliverTo: CATCH, routed: true });
      expect(r.original).toBe(a.trim().toLowerCase());
    }
  });
  it('leaves other domains untouched', () => {
    expect(routeRecipient('bob@example.com', OWN)).toMatchObject({ deliverTo: 'bob@example.com', routed: false });
  });
  it.each([
    'a@evil.whinkgroup.com.attacker.io',
    'whinkgroup.com@evil.com',
    'a@sub.whinkgroup.com',
    'a@notwhinkgroup.com',
    'a@whinkgroup.com.evil.io',
  ])('does not route %s', (a) => {
    const r = routeRecipient(a, OWN);
    expect(r.routed).toBe(false);
    expect(r.deliverTo).toBe(a);
  });
  it.each([
    'a@whіnkgroup.com', // cyrillic i
    'a@ｗhinkgroup.com', // fullwidth w
    'a@whinkgroup.com\r\nBcc: x@evil.com',
    'a@whinkgroup.com, b@evil.com',
    'Name <a@whinkgroup.com>',
    '', 'nope', 'a@@whinkgroup.com', 'a..b@whinkgroup.com',
  ])('rejects malformed or lookalike address %j', (a) => {
    const r = routeRecipient(a, OWN);
    expect(r).toMatchObject({ valid: false, deliverTo: '', routed: false });
  });
  it('never routes anywhere but the configured catch-all, and fails closed on a bad config', () => {
    const cfg = { catchAllTo: 'not an address', domains: ['whinkgroup.com'], preserveOriginal: true };
    expect(routeRecipient('a@whinkgroup.com', OWN, cfg).routed).toBe(false);
    const ok = { catchAllTo: 'x@y.io', domains: ['whinkgroup.com'], preserveOriginal: false };
    expect(routeRecipient('a@whinkgroup.com', OWN, ok).deliverTo).toBe('x@y.io');
    expect(routingHeaders(routeRecipient('a@whinkgroup.com', OWN, ok), ok)).toEqual({});
  });
});

describe('non-owner sender', () => {
  it('is never rerouted', () => {
    expect(routeRecipient('staff@whinkgroup.com', { senderIsOwner: false })).toMatchObject({ deliverTo: 'staff@whinkgroup.com', routed: false, valid: true });
  });
});

describe('deliver EMAIL', () => {
  beforeEach(() => {
    findUnique.mockReset();
    vi.stubEnv('WHINK_OWNER_EMAILS', 'victor@example.org');
  });
  it('does not reroute for a non-owner account, and fails safe on lookup error', async () => {
    findUnique.mockResolvedValue({ email: 'someone@else.com' });
    let r = await deliver({ channel: 'EMAIL', to: 'staff@whinkgroup.com', body: 'x', userId: 'u2' });
    expect(r.deliveredTo).toBe('staff@whinkgroup.com');
    findUnique.mockRejectedValue(new Error('db'));
    r = await deliver({ channel: 'EMAIL', to: 'staff@whinkgroup.com', body: 'x', userId: 'u2' });
    expect(r.deliveredTo).toBe('staff@whinkgroup.com');
  });

  it('reports the routed address and X-Original-To, keeping the original unchanged', async () => {
    findUnique.mockResolvedValue({ email: 'Victor@Example.org' });
    const r = await deliver({ channel: 'EMAIL', to: 'Amara.Okafor@whinkgroup.com', body: 'x', userId: 'u1' });
    expect(r.deliveredTo).toBe(CATCH);
    expect(r.originalTo).toBe('amara.okafor@whinkgroup.com');
    expect(r.headers).toEqual({ 'X-Original-To': 'amara.okafor@whinkgroup.com' });
  });
  it('refuses an invalid recipient', async () => {
    findUnique.mockResolvedValue({ email: 'victor@example.org' });
    const r = await deliver({ channel: 'EMAIL', to: 'a@whinkgroup.com, b@evil.com', body: 'x', userId: 'u1' });
    expect(r).toMatchObject({ sent: false, reason: 'invalid_recipient' });
  });
});
