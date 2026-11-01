import { createHash } from 'crypto';
import { z } from 'zod';
import { filterToolResult, scanForInjectionPatterns, stripFakeUntrustedTags, wrapUntrustedContent } from '@/lib/content-isolation';
import { getSubsidiaries } from '@/lib/subsidiaries';
import companies from '@/config/companies.json';
import products from '@/config/products.json';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** ISO week label, e.g. 2026-W44. UTC. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

/** Strip envelope tags, normalise, cap. For any external or model-derived text. */
export function cleanText(s: unknown, max: number): string {
  return filterToolResult(stripFakeUntrustedTags(String(s ?? ''))).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function isInjection(s: string): boolean {
  return scanForInjectionPatterns(s).suspicious;
}

export function wrapItem(text: string, kind: string, origin: string): string {
  return wrapUntrustedContent(text, kind, origin);
}

/** Trusted config text describing Victor's companies, used as the relevance yardstick. */
export function businessContext(): string {
  const subs = getSubsidiaries().map((s) => `- ${s.name} (${s.id}): ${s.intro}`).join('\n');
  const cos = (companies as Array<{ name: string; description: string | null }>).map((c) => `- ${c.name}: ${c.description ?? ''}`).join('\n');
  const prods = (products as Array<{ name: string; description: string | null }>).map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ''}`).join('\n');
  return `Subsidiaries:\n${subs}\nCompanies:\n${cos}\nProducts:\n${prods}`;
}

/** Pull the first JSON value out of a model reply (it may add prose or code fences), then validate it. */
export function parseModelJson<S extends z.ZodTypeAny>(text: string, schema: S): z.output<S> | null {
  const m = /[[{][\s\S]*[\]}]/.exec(text);
  if (!m) return null;
  try {
    const r = schema.safeParse(JSON.parse(m[0]));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export const THRESHOLD = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
