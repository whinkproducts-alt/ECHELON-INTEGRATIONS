import { describe, it, expect } from 'vitest';
import { routeRecipient, routingHeaders } from '../comms/mail-routing';
import { deliver } from '../comms/delivery';

const CATCH = 'whinkproducts@gmail.com';

describe('routeRecipient', () => {
  it('routes any whinkgroup.com address to the catch-all, case-insensitively', () => {
    for (const a of ['victor.igboekwe@whinkgroup.com', 'Amara.Okafor@WHINKGROUP.COM', ' anyone@whinkgroup.com ']) {
      const r = routeRecipient(a);
      expect(r).toMatchObject({ valid: true, deliverTo: CATCH, routed: true });
      expect(r.original).toBe(a.trim().toLowerCase());
    }
  });
  it('leaves other domains untouched', () => {
    expect(routeRecipient('bob@example.com')).toMatchObject({ deliverTo: 'bob@example.com', routed: false });
  });
  it.each([
    'a@evil.whinkgroup.com.attacker.io',
    'whinkgroup.com@evil.com',
    'a@sub.whinkgroup.com',
    'a@notwhinkgroup.com',
    'a@whinkgroup.com.evil.io',
  ])('does not route %s', (a) => {
    const r = routeRecipient(a);
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
    const r = routeRecipient(a);
    expect(r).toMatchObject({ valid: false, deliverTo: '', routed: false });
  });
  it('never routes anywhere but the configured catch-all, and fails closed on a bad config', () => {
    const cfg = { catchAllTo: 'not an address', domains: ['whinkgroup.com'], preserveOriginal: true };
    expect(routeRecipient('a@whinkgroup.com', cfg).routed).toBe(false);
    const ok = { catchAllTo: 'x@y.io', domains: ['whinkgroup.com'], preserveOriginal: false };
    expect(routeRecipient('a@whinkgroup.com', ok).deliverTo).toBe('x@y.io');
    expect(routingHeaders(routeRecipient('a@whinkgroup.com', ok), ok)).toEqual({});
  });
});

describe('deliver EMAIL', () => {
  it('reports the routed address and X-Original-To, keeping the original unchanged', async () => {
    const r = await deliver({ channel: 'EMAIL', to: 'Amara.Okafor@whinkgroup.com', body: 'x', userId: 'u1' });
    expect(r.deliveredTo).toBe(CATCH);
    expect(r.originalTo).toBe('amara.okafor@whinkgroup.com');
    expect(r.headers).toEqual({ 'X-Original-To': 'amara.okafor@whinkgroup.com' });
  });
  it('refuses an invalid recipient', async () => {
    const r = await deliver({ channel: 'EMAIL', to: 'a@whinkgroup.com, b@evil.com', body: 'x', userId: 'u1' });
    expect(r).toMatchObject({ sent: false, reason: 'invalid_recipient' });
  });
});
