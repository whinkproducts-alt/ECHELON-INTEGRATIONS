/**
 * org-authority.ts
 * Maps agent/user subjects to their authority tier and enforces
 * the minimum-tier gate on decisions.
 *
 * Authority lattice (ascending authority):
 *   agent → team_lead → dept_head → director → subsidiary_dir
 *           → exec → board → founder
 */

import { prisma } from '@/lib/db';

// ── Tier definitions ──────────────────────────────────────────────────────────

export const TIERS = [
  'agent',
  'team_lead',
  'dept_head',
  'director',
  'subsidiary_dir',
  'exec',
  'board',
  'founder',
] as const;

export type Tier = (typeof TIERS)[number];

const TIER_RANK: Record<Tier, number> = {
  agent: 0,
  team_lead: 1,
  dept_head: 2,
  director: 3,
  subsidiary_dir: 4,
  exec: 5,
  board: 6,
  founder: 7,
};

// ── Exec agent identifiers ────────────────────────────────────────────────────

/** All agent IDs that map to the 'exec' tier. Case-insensitive match at runtime. */
export const EXEC_AGENT_IDS = new Set([
  'WHINK',
  'WHINKCEO',
  'WHINKPRIMARY',
  'MAMBA',
  'MAMBACEO',
  'MAMBAOBSIDIAN',
  'MARCUS',
  'MARCUSVALE',
]);

// ── TTL cache ─────────────────────────────────────────────────────────────────

interface CacheEntry {
  tier: Tier;
  expiresAt: number; // Date.now() + TTL_MS
}

const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const tierCache = new Map<string, CacheEntry>();

function getCached(key: string): Tier | undefined {
  const entry = tierCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    tierCache.delete(key);
    return undefined;
  }
  return entry.tier;
}

function setCache(key: string, tier: Tier): void {
  tierCache.set(key, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
}

/** Invalidate cache for a subject (call after privilege changes). */
export function invalidateTierCache(subjectId: string): void {
  tierCache.delete(subjectId);
}

/** For testing: wipe entire cache. */
export function _clearTierCache(): void {
  tierCache.clear();
}

// ── Tier resolution ───────────────────────────────────────────────────────────

export type InvokeSubject =
  | { type: 'AGENT'; agentId: string }
  | { type: 'OWNER' };

/**
 * Resolves the authority tier for a subject.
 * - OWNER always resolves to 'founder'.
 * - AGENT checks static exec list first (no DB), then falls back to DB lookup.
 * - Result is cached for TIER_CACHE_TTL_MS.
 */
export async function mapSubjectToTier(
  subject: InvokeSubject,
  userId: string,
): Promise<Tier> {
  if (subject.type === 'OWNER') return 'founder';

  const { agentId } = subject;
  const cacheKey = `${userId}:${agentId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Static exec check (zero DB cost for known exec agents)
  if (EXEC_AGENT_IDS.has(agentId.toUpperCase())) {
    setCache(cacheKey, 'exec');
    return 'exec';
  }

  // DB lookup for dynamically-registered agents
  const agent = await prisma.agent
    .findFirst({
      where: { id: agentId, userId },
      select: { tier: true },
    })
    .catch(() => null);

  const tier: Tier = isValidTier(agent?.tier) ? (agent!.tier as Tier) : 'agent';
  setCache(cacheKey, tier);
  return tier;
}

function isValidTier(value: unknown): value is Tier {
  return typeof value === 'string' && TIERS.includes(value as Tier);
}

// ── Gate enforcement ──────────────────────────────────────────────────────────

/**
 * Returns true if `subjectTier` meets or exceeds `minimumTier`.
 * This is the single source of truth for all lattice gate checks.
 */
export function meetsMinimumTier(subjectTier: Tier, minimumTier: Tier): boolean {
  return TIER_RANK[subjectTier] >= TIER_RANK[minimumTier];
}

/**
 * Throws if the subject's tier does not meet the minimum required.
 * Use this inside approval checks and capability guards.
 */
export async function assertMinimumTier(
  subject: InvokeSubject,
  userId: string,
  minimumTier: Tier,
): Promise<void> {
  const tier = await mapSubjectToTier(subject, userId);
  if (!meetsMinimumTier(tier, minimumTier)) {
    throw new Error(
      `Authority gate: subject tier '${tier}' does not meet minimum '${minimumTier}'`,
    );
  }
}

/**
 * Quick sync check for already-resolved tiers (no async).
 * Throws if `subjectTier` is below `minimumTier`.
 */
export function enforceMinimumTier(subjectTier: Tier, minimumTier: Tier): void {
  if (!meetsMinimumTier(subjectTier, minimumTier)) {
    throw new Error(
      `Authority gate: tier '${subjectTier}' is below required '${minimumTier}'`,
    );
  }
}
