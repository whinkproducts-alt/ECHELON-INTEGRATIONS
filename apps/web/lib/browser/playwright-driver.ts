/**
 * Real driver on playwright-core (Apache-2.0, not yet a dependency: Victor installs it, see docs/lanes/h-notes.md).
 * Headless, fresh incognito context, default user agent, no stealth plugins, no CAPTCHA handling. Loaded lazily so the
 * app builds and runs without it.
 */
import type { BrowserDriver } from '@/lib/browser/tool';

export async function openPlaywrightDriver(): Promise<BrowserDriver> {
  const mod = 'playwright-core';
  const { chromium } = (await import(/* webpackIgnore: true */ mod)) as { chromium: { launch(o: object): Promise<any> } };
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  return {
    async goto(url) { await page.goto(url, { timeout: 15_000 }); return { url: page.url(), title: await page.title(), text: await page.innerText('body') }; },
    currentUrl: () => page.url(),
    click: (s) => page.click(s, { timeout: 5_000 }),
    type: (s, t) => page.fill(s, t, { timeout: 5_000 }),
    close: () => browser.close(),
  };
}
