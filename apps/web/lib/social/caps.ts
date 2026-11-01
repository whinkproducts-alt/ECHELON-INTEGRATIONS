/**
 * Per-user daily caps on social writes. Enforced server-side before an approval is created and
 * again at execution (approved call and scheduled send). Counts come from the action ledger
 * (executed rows only) so a refused or failed call never consumes the cap.
 *
 * Defaults can be overridden with SOCIAL_DAILY_CAPS, a JSON object with any of
 * posts, replies, dms, follows, deletes. Invalid values fall back to the default for that key.
 * The day is the UTC calendar day.
 */

import { prisma } from '@/lib/db';
import { countToolExecutions, recordActionSafe } from '@/lib/ledger';
import { GATEWAY_TOOL_PREFIX, SOCIAL_GATEWAY_PLATFORMS, socialPlatformOf } from '@/lib/gateway-access';

export type CapCategory = 'posts' | 'replies' | 'dms' | 'follows' | 'deletes';

export const DEFAULT_DAILY_CAPS: Record<CapCategory, number> = {
  posts: 25,
  replies: 50,
  dms: 20,
  follows: 10, // follows and unfollows combined
  deletes: 20,
};

/** Gateway action names (after `<platform>__`) per category. */
const CATEGORY_ACTIONS: Record<CapCategory, string[]> = {
  posts: ['post', 'publish_post', 'publish_video'],
  replies: ['reply', 'reply_comment'],
  dms: ['send_dm'],
  follows: ['follow', 'unfollow'],
  deletes: ['delete_post'],
};

export function dailyCaps(): Record<CapCategory, number> {
  const caps = { ...DEFAULT_DAILY_CAPS };
  const raw = process.env.SOCIAL_DAILY_CAPS?.trim();
  if (!raw) return caps;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const k of Object.keys(caps) as CapCategory[]) {
        const v = (parsed as Record<string, unknown>)[k];
        if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000) caps[k] = v;
      }
    }
  } catch { /* defaults */ }
  return caps;
}

/** The cap category of a social write tool, or null for reads and non-social tools. */
export function capCategoryOf(toolName: string): CapCategory | null {
  if (!socialPlatformOf(toolName)) return null;
  const action = toolName.slice(GATEWAY_TOOL_PREFIX.length).split('__').slice(1).join('__');
  for (const cat of Object.keys(CATEGORY_ACTIONS) as CapCategory[]) {
    if (CATEGORY_ACTIONS[cat].includes(action)) return cat;
  }
  return null;
}

function categoryTools(cat: CapCategory): string[] {
  const out: string[] = [];
  for (const p of SOCIAL_GATEWAY_PLATFORMS) for (const a of CATEGORY_ACTIONS[cat]) out.push(`${GATEWAY_TOOL_PREFIX}${p}__${a}`);
  return out;
}

export function utcDayBounds(at: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60_000) };
}

export interface CapCheck {
  allowed: boolean;
  category: CapCategory;
  used: number;
  limit: number;
}

/**
 * Is one more write in this category allowed for the user on the given day (default today)?
 * Posts also count scheduled posts that are due on that day and not yet sent
 * (excludeScheduledId lets an edit not count the post it replaces).
 */
export async function checkDailyCap(
  userId: string,
  category: CapCategory,
  opts: { day?: Date; excludeScheduledId?: string } = {},
): Promise<CapCheck> {
  if (!userId) throw new Error('social: userId is required');
  const limit = dailyCaps()[category];
  const day = opts.day ?? new Date();
  const { start, end } = utcDayBounds(day);
  let used = await countToolExecutions(userId, categoryTools(category), start, end);
  if (category === 'posts') {
    used += await prisma.scheduledPost.count({
      where: {
        userId,
        status: { in: ['scheduled', 'sending'] },
        sendAt: { gte: start, lt: end },
        ...(opts.excludeScheduledId ? { id: { not: opts.excludeScheduledId } } : {}),
      },
    });
  }
  return { allowed: used < limit, category, used, limit };
}

/** Ledger a refusal. The result string callers return to the model is always 'daily_cap_reached'. */
export async function ledgerCapRefusal(
  userId: string,
  tool: string,
  check: CapCheck,
  extra: { persona?: string; mambaMode?: string; correlationId?: string; stage: 'before_approval' | 'at_execution' },
): Promise<void> {
  await recordActionSafe({
    userId,
    initiator: 'system',
    persona: extra.persona,
    mambaMode: extra.mambaMode,
    tool,
    action: 'social_daily_cap_reached',
    permissionClass: 'C',
    status: 'DENIED',
    outputSummary: `daily_cap_reached: ${check.category} ${check.used}/${check.limit} (${extra.stage})`,
    correlationId: extra.correlationId,
  });
}

export const DAILY_CAP_ERROR = 'daily_cap_reached: the daily limit for this kind of social action has been reached. Try again tomorrow (UTC).';
