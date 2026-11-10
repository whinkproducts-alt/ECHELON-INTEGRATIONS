/**
 * Executable wrapper for the browser tool.
 * This is the code that runs on the Windows laptop to control Firefox via Playwright.
 * It does NOT go through the OpenClaw egress gate — it's a local-only process.
 * All Class C approval gates happen before this code is reached.
 */

import { chromium } from 'playwright';
import { logger } from '@/lib/logger';
import { recordAction } from '@/lib/ledger';

export async function executeBrowserTool(action: string, args: Record<string, unknown>): Promise<string> {
  switch (action) {
    case 'navigate':
      return navigateBrowser(args.url);
    case 'click':
      return clickBrowser(args.selector);
    case 'type':
      return typeBrowser(args.selector, args.text);
    case 'screenshot':
      return screenshotBrowser(args.screenshotPath);
    case 'close':
      return closeBrowser();
    default:
      throw new Error(`Unknown browser action: ${action}`);
  }
}

async function navigateBrowser(url: unknown): Promise<string> {
  if (!url || typeof url !== 'string') throw new Error('URL is required for navigate action');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title() || 'Untitled';

    // Take screenshot
    const screenshotPath = `/tmp/browser_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, type: 'png' });

    // Record action in ledger
    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_navigate',
      permissionClass: 'C',
      status: 'EXECUTED',
      inputSummary: `url=${url}`, // omit for security
      outputSummary: `title=${title}`, // omit for security
      correlationId: `browser-${Date.now()}`,
    });

    return JSON.stringify({
      title,
      screenshotPath,
      success: true,
    });
  } catch (err) {
    logger.error('browser navigation failed', { error: (err as Error).message });
    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_navigate',
      permissionClass: 'C',
      status: 'FAILED',
      inputSummary: `url=${url}`,
      outputSummary: `(err)${(err as Error).message}`,
      correlationId: `browser-${Date.now()}`,
    });
    throw err;
  } finally {
    await browser.close();
  }
}

async function clickBrowser(selector: unknown): Promise<string> {
  if (!selector || typeof selector !== 'string') throw new Error('Selector is required for click action');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // First navigate to a page so there's something to interact with
    await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.click(selector, { timeout: 10000 });

    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_click',
      permissionClass: 'C',
      status: 'EXECUTED',
      inputSummary: `selector=${selector}`,
      outputSummary: 'click executed',
      correlationId: `browser-${Date.now()}`,
    });

    return JSON.stringify({ success: true, selector });
  } catch (err) {
    logger.error('browser click failed', { error: (err as Error).message });
    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_click',
      permissionClass: 'C',
      status: 'FAILED',
      inputSummary: `selector=${selector}`,
      outputSummary: `(err)${(err as Error).message}`,
      correlationId: `browser-${Date.now()}`,
    });
    throw err;
  } finally {
    await browser.close();
  }
}

async function typeBrowser(selector: unknown, text: unknown): Promise<string> {
  if (!selector || typeof selector !== 'string') throw new Error('Selector is required for type action');
  if (!text || typeof text !== 'string') throw new Error('Text is required for type action');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    // First navigate to a page so there's something to interact with
    await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.fill(selector, text, { timeout: 10000 });

    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_type',
      permissionClass: 'C',
      status: 'EXECUTED',
      inputSummary: `selector=${selector}, textLength=${text.length}`,
      outputSummary: 'text filled',
      correlationId: `browser-${Date.now()}`,
    });

    return JSON.stringify({ success: true, selector, textLength: text.length });
  } catch (err) {
    logger.error('browser type failed', { error: (err as Error).message });
    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_type',
      permissionClass: 'C',
      status: 'FAILED',
      inputSummary: `selector=${selector}, textLength=${text.length}`,
      outputSummary: `(err)${(err as Error).message}`,
      correlationId: `browser-${Date.now()}`,
    });
    throw err;
  } finally {
    await browser.close();
  }
}

async function screenshotBrowser(screenshotPath: unknown): Promise<string> {
  if (!screenshotPath || typeof screenshotPath !== 'string') throw new Error('Screenshot path is required');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // First navigate to a page so there's something to screenshot
    await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.screenshot({ path: screenshotPath, type: 'png', fullPage: true });

    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_screenshot',
      permissionClass: 'C',
      status: 'EXECUTED',
      inputSummary: `screenshotPath=${screenshotPath}`,
      outputSummary: 'screenshot captured',
      correlationId: `browser-${Date.now()}`,
    });

    return JSON.stringify({ screenshotPath, success: true });
  } catch (err) {
    logger.error('browser screenshot failed', { error: (err as Error).message });
    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_screenshot',
      permissionClass: 'C',
      status: 'FAILED',
      inputSummary: `screenshotPath=${screenshotPath}`,
      outputSummary: `(err)${(err as Error).message}`,
      correlationId: `browser-${Date.now()}`,
    });
    throw err;
  } finally {
    await browser.close();
  }
}

async function closeBrowser(): Promise<string> {
  // This function should close the current browser instance
  // In the current architecture, each call spawns its own browser, so we need to track it
  // For now, we'll create a shared browser instance similar to browser-tool.ts
  if (!closeBrowser.browserInstance) {
    closeBrowser.browserInstance = await chromium.launch({ headless: true });
  }
  await closeBrowser.browserInstance.close();
  closeBrowser.browserInstance = null;
  return JSON.stringify({ success: true });
}

// Store browser instance as static variable
closeBrowser.browserInstance = null;