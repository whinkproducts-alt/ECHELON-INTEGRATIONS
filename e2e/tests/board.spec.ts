import { test, expect } from '@playwright/test';
import { OWNER, USER_B, loginAndWait, apiJson } from './helpers';

test.describe('Board Room (owner only)', () => {
  test('owner sees the Board Room with 8 members', async ({ page }) => {
    await loginAndWait(page, OWNER.email);
    await page.goto('/dashboard/board');
    await expect(page.getByRole('heading', { name: 'Board Room' })).toBeVisible();
    await expect(page.getByText(/\b8 members\b/)).toBeVisible();
    const api = await apiJson<{ members: unknown[] }>(page, 'GET', '/api/board');
    expect(api.status).toBe(200);
    expect(api.json.members).toHaveLength(8);
  });

  test('a non-owner sees the owner-only message and an empty roster', async ({ page }) => {
    await loginAndWait(page, USER_B.email);
    await page.goto('/dashboard/board');
    await expect(page.getByText('Board Room is owner only')).toBeVisible();
    await expect(page.getByText(/\b8 members\b/)).toHaveCount(0);
    const api = await apiJson<{ members: unknown[] }>(page, 'GET', '/api/board');
    expect(api.status).toBe(200);
    expect(api.json.members).toEqual([]);
  });
});
