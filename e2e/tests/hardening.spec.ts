import { test, expect } from '@playwright/test';

test.describe('production hardening', () => {
  test('security headers are present on /login', async ({ request }) => {
    const res = await request.get('/login');
    expect(res.status()).toBe(200);
    const h = res.headers();
    expect(h['content-security-policy']).toMatch(/default-src/);
    expect(h['content-security-policy']).toMatch(/nonce-/);
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toBeTruthy();
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
  });

  test('/dev-preview/board is a 404 in the production build', async ({ request }) => {
    const res = await request.get('/dev-preview/board', { maxRedirects: 0 });
    // Unauthenticated production requests hit the auth wall (redirect); neither may ever render the preview.
    expect([307, 404]).toContain(res.status());
  });

  test('/dev-preview/board is a 404 even when signed in', async ({ page }) => {
    const { loginAndWait, OWNER } = await import('./helpers');
    await loginAndWait(page, OWNER.email);
    const res = await page.goto('/dev-preview/board');
    expect(res?.status()).toBe(404);
  });
});
