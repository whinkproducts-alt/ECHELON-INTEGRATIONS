import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const OWNER = { email: 'e2e-owner@example.test' };
export const USER_B = { email: 'e2e-user-b@example.test' };
export const PASSWORD = process.env.E2E_PASSWORD || 'e2e-Test-Pass-1!';

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  // Labels and an exact button name, so the passkey button ("Sign in with a passkey") never matches.
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

export async function loginAndWait(page: Page, email: string) {
  await login(page, email);
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function newSession(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAndWait(page, email);
  return { context, page };
}

/** same-origin fetch from inside the page, so the browser sends the session cookie and Sec-Fetch-Site like a real click. */
export async function apiJson<T = unknown>(page: Page, method: string, url: string, body?: unknown): Promise<{ status: number; json: T }> {
  return page.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u as string, {
        method: m as string,
        headers: b === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: b === undefined ? undefined : JSON.stringify(b),
      });
      let json: unknown = null;
      try { json = await r.json(); } catch { /* empty body */ }
      return { status: r.status, json };
    },
    [method, url, body] as const,
  ) as Promise<{ status: number; json: T }>;
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
