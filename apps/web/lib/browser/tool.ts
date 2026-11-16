/**
 * Local, non-stealth browser tool (item 49). Honest default user agent, fresh profile, no fingerprint changes, no CAPTCHA
 * handling. Everything goes through classifyBrowserAction, the gate and the ledger. Page text returns as untrusted data.
 */
import { classifyBrowserAction, parseWebUrl, type BrowserAction } from '@/lib/browser/policy';
import { gate, ledgerRun, type GateInput, type GateResult } from '@/lib/exec-gate';
import { wrapUntrustedContent, stripFakeUntrustedTags } from '@/lib/content-isolation';

export interface BrowserDriver {
  goto(url: string): Promise<{ url: string; title: string; text: string }>;
  currentUrl(): string;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  close(): Promise<void>;
}
export type BrowserStep = { op: 'read' } | { op: 'click'; selector: string } | { op: 'type'; selector: string; text: string };
export interface BrowserRequest { userId: string; url: string; step: BrowserStep; allowDomains: readonly string[]; driver: BrowserDriver; approvalId?: string; correlationId?: string }
export type BrowserResult = GateResult | { ok: true; url: string; title?: string; content?: string };
const TEXT_CAP = 20_000;

export async function runBrowser(r: BrowserRequest): Promise<BrowserResult> {
  const action: BrowserAction = r.step.op === 'read' ? 'read' : 'write';
  // A write acts on the page the browser is on now, so classify that page, not only the one asked for.
  const pageUrl = action === 'write' ? r.driver.currentUrl() : r.url;
  const c = classifyBrowserAction(action, pageUrl, r.allowDomains);
  if (!c.class) return { ok: false, needsApproval: false, reason: c.reason };
  if (action === 'write' && parseWebUrl(pageUrl)?.host !== parseWebUrl(r.url)?.host) return { ok: false, needsApproval: false, reason: 'browser is not on the page named in the request' };
  const gi: GateInput = {
    userId: r.userId, capability: action === 'read' ? 'browser_read' : 'browser_write', cls: c.class, correlationId: r.correlationId, approvalId: r.approvalId,
    params: { url: r.url, step: r.step.op === 'type' ? { op: 'type', selector: r.step.selector, text: r.step.text } : r.step },
    summary: `browser ${r.step.op} ${r.url} (${c.reason})`,
  };
  const g = await gate(gi);
  if (!g.ok) return g;
  try {
    let out: BrowserResult;
    if (r.step.op === 'read') {
      const p = await r.driver.goto(r.url);
      const back = classifyBrowserAction('read', p.url, r.allowDomains); // a redirect may land somewhere blocked
      if (!back.class) throw new Error(`redirected: ${back.reason}`);
      out = { ok: true, url: p.url, title: p.title, content: wrapUntrustedContent(stripFakeUntrustedTags(p.text.slice(0, TEXT_CAP)), 'web_page', p.url) };
    } else {
      if (r.step.op === 'click') await r.driver.click(r.step.selector); else await r.driver.type(r.step.selector, r.step.text);
      out = { ok: true, url: r.driver.currentUrl() };
    }
    await ledgerRun(gi, 'EXECUTED', 'ok');
    return out;
  } catch (e) {
    await ledgerRun(gi, 'FAILED', e instanceof Error ? e.message : 'error');
    return { ok: false, needsApproval: false, reason: e instanceof Error ? e.message : 'error' };
  }
}
