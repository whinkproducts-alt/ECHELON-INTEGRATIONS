import { describe, it, expect } from 'vitest';
import {
  parseConnections, statusLabel, connectButtonLabel, validateAuthorizeUrl,
  errorMessage, noticeFromQuery, interpretConnectResponse, consentText, DAILY_LIMITS_NOTE,
} from '../social-ui';

describe('parseConnections', () => {
  it('fills all three platforms from garbage', () => {
    const r = parseConnections(null);
    expect(r.map((c) => c.platform)).toEqual(['x', 'instagram', 'tiktok']);
    expect(r.every((c) => c.status === 'not_connected')).toBe(true);
  });
  it('parses a connection and drops bad fields', () => {
    const r = parseConnections({
      connections: [{ platform: 'x', status: 'connected', handle: 'vic', connectedAt: '2026-01-01T00:00:00Z', scopes: ['a', 3, 'b'] },
        { platform: 'tiktok', status: 'weird' }],
    });
    expect(r[0]).toMatchObject({ status: 'connected', handle: 'vic', scopes: ['a', 'b'] });
    expect(r[2].status).toBe('not_connected');
  });
});

describe('statusLabel', () => {
  it('maps statuses', () => {
    expect(statusLabel('not_connected', null)).toBe('Not connected');
    expect(statusLabel('connected', '@vic')).toBe('Connected as @vic');
    expect(statusLabel('connected', 'vic')).toBe('Connected as @vic');
    expect(statusLabel('connected', null)).toBe('Connected');
    expect(statusLabel('expired', 'vic')).toContain('reconnect');
    expect(connectButtonLabel('expired')).toBe('Reconnect');
    expect(connectButtonLabel('not_connected')).toBe('Connect');
  });
});

describe('validateAuthorizeUrl', () => {
  it('accepts allow-listed https origins', () => {
    expect(validateAuthorizeUrl('x', 'https://x.com/i/oauth2/authorize?a=1')).not.toBeNull();
    expect(validateAuthorizeUrl('x', 'https://twitter.com/i/oauth2/authorize')).not.toBeNull();
    expect(validateAuthorizeUrl('instagram', 'https://api.instagram.com/oauth/authorize')).not.toBeNull();
    expect(validateAuthorizeUrl('tiktok', 'https://www.tiktok.com/v2/auth/authorize/')).not.toBeNull();
  });
  it('refuses http, wrong host, lookalikes, creds, cross-platform, junk', () => {
    expect(validateAuthorizeUrl('x', 'http://x.com/a')).toBeNull();
    expect(validateAuthorizeUrl('x', 'https://evil.com/a')).toBeNull();
    expect(validateAuthorizeUrl('x', 'https://x.com.evil.com/a')).toBeNull();
    expect(validateAuthorizeUrl('x', 'https://x.com@evil.com/a')).toBeNull();
    expect(validateAuthorizeUrl('x', 'https://user:pw@x.com/a')).toBeNull();
    expect(validateAuthorizeUrl('x', 'https://x.com:8443/a')).toBeNull();
    expect(validateAuthorizeUrl('x', 'javascript:alert(1)')).toBeNull();
    expect(validateAuthorizeUrl('tiktok', 'https://x.com/a')).toBeNull();
    expect(validateAuthorizeUrl('x', 42)).toBeNull();
    expect(validateAuthorizeUrl('x', '')).toBeNull();
  });
});

describe('error mapping', () => {
  it('maps known codes and never echoes unknown text', () => {
    expect(errorMessage('access_denied')).toMatch(/declined/);
    const msg = errorMessage('<img src=x onerror=alert(1)>');
    expect(msg).not.toContain('<');
    expect(errorMessage('__proto__')).not.toContain('undefined');
    expect(errorMessage(null)).toBeTruthy();
  });
  it('notice from query', () => {
    expect(noticeFromQuery('x', null)).toEqual({ kind: 'connected', text: 'X connected.' });
    expect(noticeFromQuery('<b>', null)).toBeNull();
    expect(noticeFromQuery(null, 'access_denied')?.kind).toBe('error');
    expect(noticeFromQuery('x', 'access_denied')?.kind).toBe('error');
  });
});

describe('interpretConnectResponse', () => {
  it('503 not configured', () => {
    expect(interpretConnectResponse('x', 503, { error: 'platform_not_configured' }))
      .toEqual({ ok: false, message: 'Not configured by the operator yet' });
  });
  it('refuses untrusted url, accepts trusted', () => {
    expect(interpretConnectResponse('x', 200, { authorizeUrl: 'https://evil.com' }).ok).toBe(false);
    expect(interpretConnectResponse('x', 200, {}).ok).toBe(false);
    expect(interpretConnectResponse('x', 200, { authorizeUrl: 'https://x.com/i/oauth2/authorize' }).ok).toBe(true);
  });
  it('other failures', () => {
    expect(interpretConnectResponse('x', 500, null).ok).toBe(false);
  });
});

describe('callback error codes', () => {
  const codes = ['exchange_failed', 'denied', 'missing_params', 'storage_failed', 'identity_failed',
    'invalid_state', 'redirect_not_allowed', 'platform_not_configured', 'encryption_not_configured', 'unknown_platform'];
  it('maps every backend code to fixed text, not the generic one', () => {
    const generic = errorMessage('totally_unknown');
    for (const c of codes) {
      expect(errorMessage(c)).toBeTruthy();
      expect(errorMessage(c)).not.toBe(generic);
    }
    expect(errorMessage('totally_unknown')).toMatch(/could not be completed/);
  });
  it('503 encryption_not_configured', () => {
    expect(interpretConnectResponse('x', 503, { error: 'encryption_not_configured' }))
      .toEqual({ ok: false, message: "Secure storage isn't configured on this server yet." });
  });
});

describe('consent text', () => {
  it('X lists the full scope with the tenant product name', () => {
    const t = consentText('x', 'Acme')[0];
    expect(t).toContain('Acme can read your timeline, mentions and direct messages');
    expect(t).toContain('outside Canada');
    expect(t).toContain("other people's messages");
    expect(t).toContain('Disconnect at any time');
  });
  it('instagram and tiktok notes', () => {
    expect(consentText('instagram', 'Acme').join(' ')).toContain('Business or Creator');
    expect(consentText('tiktok', 'Acme').join(' ')).toContain('private until the platform audit completes');
  });
  it('limits note', () => {
    expect(DAILY_LIMITS_NOTE).toMatch(/Daily limits apply/);
  });
});
