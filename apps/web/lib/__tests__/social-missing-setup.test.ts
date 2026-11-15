import { describe, it, expect } from 'vitest';
import { missingSetup } from '@/lib/social/oauth';
import { interpretConnectResponse } from '@/lib/social-ui';

describe('Connected Apps setup guidance', () => {
  it('lists only the variable names that are still empty, never values', () => {
    expect(missingSetup('x', {})).toEqual(['X_CLIENT_ID', 'X_CLIENT_SECRET', 'SOCIAL_OAUTH_REDIRECT_BASE']);
    expect(missingSetup('x', { X_CLIENT_ID: 'id', X_CLIENT_SECRET: 'secret', SOCIAL_OAUTH_REDIRECT_BASE: 'http://localhost:3000' })).toEqual([]);
    expect(missingSetup('tiktok', { TIKTOK_CLIENT_KEY: 'k', SOCIAL_OAUTH_REDIRECT_BASE: ' ' })).toEqual(['TIKTOK_CLIENT_SECRET', 'SOCIAL_OAUTH_REDIRECT_BASE']);
  });

  it('the screen names the missing settings', () => {
    const out = interpretConnectResponse('instagram', 503, { error: 'platform_not_configured', missing: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'] });
    expect(out).toEqual({ ok: false, message: expect.stringContaining('INSTAGRAM_CLIENT_ID, INSTAGRAM_CLIENT_SECRET') });
  });

  it('ignores anything in "missing" that is not a plain setting name, and falls back to the old text', () => {
    const odd = interpretConnectResponse('x', 503, { error: 'platform_not_configured', missing: ['<script>', 123] });
    expect(odd).toEqual({ ok: false, message: 'Not configured by the operator yet' });
    expect(interpretConnectResponse('x', 503, { error: 'platform_not_configured' })).toEqual({ ok: false, message: 'Not configured by the operator yet' });
  });
});
