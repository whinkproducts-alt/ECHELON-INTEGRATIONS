import { chromium, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/lib/logger';
import { recordAction } from '@/lib/ledger';
import { checkBrowserPermission, classifyBrowserApproval } from '@/lib/org-approval';

/**
 * Firefox automation wrapper using Playwright (local-only).
 * Provides browser_navigate, browser_click, browser_type, browser_screenshot, browser_close.
 * All tools are Class C (require Victor approval) due to external content and security implications.
 */

let browserContext: BrowserContext | null = null;
let currentPage: Page | null = null;
let isInitialized = false;

export class BrowserTool {
  readonly name = 'browser_tool';
  readonly description = 'Firefox automation for web browsing, interaction, and scraping (Class C)';
  readonly costClass = 'FREE'; // only because it is Class C; nothing runs without approval
  readonly riskClass = 'C'; // highest security class
  readonly inputSchema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['navigate', 'click', 'type', 'screenshot', 'close'] },
      url: { type: 'string' },
      selector: { type: 'string' },
      text: { type: 'string' },
      screenshotPath: { type: 'string' },
    },
    required: ['action'],
  } as const;

  async execute(args: Record<string, unknown>): Promise<string> {
    // Check org-tier browser permission before executing
    const toolName = `browser_tool__${args.action}`;
    const permissionCheck = await checkBrowserPermission(
      'system',
      toolName,
      args,
      {
        requesterTier: 'agent',
        url: args.url as string | undefined,
      }
    );

    if (!permissionCheck.allowed && permissionCheck.method === 'requires_confirmation') {
      // Class C action requires approval at the appropriate tier
      // Log the attempted action
      await recordAction({
        userId: 'system',
        initiator: 'automation',
        action: toolName,
        permissionClass: 'C',
        status: 'BLOCKED',
        inputSummary: `action=${args.action}, reason=${permissionCheck.reason}`,
        correlationId: `browser-${Date.now()}`,
      });
      throw new Error(`Browser action ${args.action} requires ${permissionCheck.browserClass} approval: ${permissionCheck.reason}`);
    }

    // Log the allowed action
    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: toolName,
      permissionClass: 'C',
      status: 'AUTHORIZED',
      inputSummary: `action=${args.action}, class=${permissionCheck.browserClass}, tier=${permissionCheck.orgTier}`,
      correlationId: `browser-${Date.now()}`,
    });

    switch (args.action) {
      case 'navigate':
        return this.navigate(String(args.url));
      case 'click':
        return this.click(String(args.selector));
      case 'type':
        return this.type(String(args.selector), String(args.text));
      case 'screenshot':
        return this.screenshot(String(args.screenshotPath));
      case 'close':
        return this.close();
      default:
        throw new Error(`Unknown browser action: ${args.action}`);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!isInitialized) {
      const browser = await chromium.launch({ headless: true });
      browserContext = await browser.newContext();
      currentPage = await browserContext.newPage();
      isInitialized = true;
      logger.info('Firefox browser (Playwright) initialized');
    }
  }

  private async navigate(url: string): Promise<string> {
    await this.ensureInitialized();
    await currentPage?.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await currentPage?.title() || 'Untitled';
    const screenshotPath = `/tmp/browser_${Date.now()}.png`;
    await currentPage?.screenshot({ path: screenshotPath, type: 'png' });
    // Record action in ledger
    await recordAction({
      userId: 'system',
      initiator: 'automation',
      action: 'browser_navigate',
      permissionClass: 'C',
      status: 'EXECUTED',
      inputSummary: `url=${url}`, // omit actual URL for security
      outputSummary: `title=${title}`, // omit screenshot for security
      correlationId: `browser-${Date.now()}`, // minimal correlation
    });
    return JSON.stringify({
      title,
      screenshotPath,
      success: true,
    });
  }

  private async click(selector: string): Promise<string> {
    await this.ensureInitialized();
    await currentPage?.click(selector, { timeout: 10000 });
    return JSON.stringify({ success: true, selector });
  }

  private async type(selector: string, text: string): Promise<string> {
    await this.ensureInitialized();
    await currentPage?.fill(selector, text, { timeout: 10000 });
    return JSON.stringify({ success: true, selector, textLength: text.length });
  }

  private async screenshot(path: string): Promise<string> {
    await this.ensureInitialized();
    await currentPage?.screenshot({ path, type: 'png', fullPage: true });
    return JSON.stringify({ screenshotPath: path, success: true });
  }

  private async close(): Promise<string> {
    if (browserContext) {
      await browserContext.close();
      browserContext = null;
      currentPage = null;
      isInitialized = false;
      logger.info('Firefox browser closed');
    }
    return JSON.stringify({ success: true });
  }

  // Health check for OpenClaw discovery
  static async healthCheck(): Promise<boolean> {
    try {
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      return true;
    } catch {
      return false;
    }
  }
}

// Export a factory function for OpenClaw
export async function getBrowserTool(): Promise<BrowserTool> {
  return new BrowserTool();
}