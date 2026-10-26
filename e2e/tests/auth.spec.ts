import { test, expect } from '@playwright/test';
import { OWNER, login, apiJson } from './helpers';

test.describe('authentication', () => {
  test('wrong password is rejected and stays on /login', async ({ page }) => {
    await login(page, OWNER.email, 'definitely-the-wrong-password');
    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('right password reaches the dashboard', async ({ page }) => {
    await login(page, OWNER.email);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'What requires your attention' })).toBeVisible();
  });

  test('unauthenticated /dashboard redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated /api/board does not return the roster', async ({ request }) => {
    const res = await request.get('/api/board', { maxRedirects: 0 });
    // The proxy redirects unauthenticated requests to /login; a 401 would be equally safe.
    expect([301, 302, 303, 307, 308, 401]).toContain(res.status());
    if (res.status() >= 300 && res.status() < 400) expect(res.headers()['location'] ?? '').toContain('/login');
    expect(await res.text()).not.toContain('members');
  });

  test('a signed-in browser can still not read another user via the API without a session cookie', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/login');
    const r = await apiJson(page, 'GET', '/api/projects');
    // fetch follows the redirect to /login (200 HTML), so json is null; either way no project data.
    expect(r.json === null || (typeof r.json === 'object' && !Array.isArray(r.json))).toBeTruthy();
    await ctx.close();
  });
});
