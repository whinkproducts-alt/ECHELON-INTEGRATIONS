import { test, expect } from '@playwright/test';

test.describe('public pages (signed out)', () => {
  test('the front page explains the product instead of redirecting to login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/chief of staff/i);
    await expect(page.getByRole('link', { name: /Create account/ }).first()).toHaveAttribute('href', '/signup');
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute('href', '/login');
  });

  test('terms and privacy are reachable and marked as internal drafts', async ({ page }) => {
    for (const path of ['/terms', '/privacy']) {
      await page.goto(path);
      await expect(page.getByRole('note')).toContainText('Internal draft');
    }
  });

  test('forgot password gives the same answer whether or not the account exists', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody-here@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists for that address, a reset link is on its way.')).toBeVisible();
  });

  test('an invalid reset link is refused with the generic message', async ({ page }) => {
    await page.goto('/reset-password?token=not-a-real-token');
    await page.getByLabel('New password', { exact: true }).fill('a-Long-Enough-Pass-1');
    await page.getByLabel('Confirm new password').fill('a-Long-Enough-Pass-1');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('alert').or(page.getByText(/expired|invalid/i)).first()).toBeVisible();
  });
});
