import { z } from 'zod';
import raw from '@/config/standing-roster.json';
import { intervalOrThrow } from '@/lib/worker/schedule';

export const JOB_TYPES = [
  'news_digest', 'opportunity_scan', 'weekly_brief', 'project_monitor',
  'memory_curation', 'security_watch', 'skills_sweeper', 'swarm_resume',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

const EntrySchema = z.object({
  key: z.string().regex(/^[a-z0-9-]{3,40}$/),
  kind: z.enum(['agent', 'persona']),
  /** org-kit agent_id for kind 'agent'; staff-directory id for kind 'persona'. */
  agentId: z.string().min(3),
  name: z.string().min(1),
  group: z.string().min(1),
  role: z.string().min(1),
  job: z.enum(JOB_TYPES).nullable(),
  params: z.record(z.string(), z.string()),
  schedule: z.string().refine((s) => { try { intervalOrThrow(s); return true; } catch { return false; } }, 'bad schedule'),
  maxTokensPerRun: z.number().int().min(0).max(20_000),
  modelTier: z.enum(['fast', 'standard', 'deep']),
  enabled: z.boolean(),
}).strict();

export const RosterSchema = z.object({
  _comment: z.string().optional(),
  version: z.number().int(),
  roster: z.array(EntrySchema),
}).strict().superRefine((v, ctx) => {
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const e of v.roster) {
    if (keys.has(e.key)) ctx.addIssue({ code: 'custom', message: `duplicate key ${e.key}` });
    if (ids.has(e.agentId)) ctx.addIssue({ code: 'custom', message: `duplicate agentId ${e.agentId}` });
    keys.add(e.key); ids.add(e.agentId);
    if (e.enabled && !e.job) ctx.addIssue({ code: 'custom', message: `${e.key}: enabled without a job` });
  }
});

export type RosterEntry = z.infer<typeof EntrySchema>;

const parsed = RosterSchema.parse(raw);

export function getRoster(): readonly RosterEntry[] { return parsed.roster; }
export function getRosterEntry(key: string): RosterEntry | null { return parsed.roster.find((e) => e.key === key) ?? null; }

/** Jobs that run without a roster entry. Cheap, no model. */
export interface SystemJob { key: string; job: JobType; schedule: string; critical: true }
export const SYSTEM_JOBS: readonly SystemJob[] = [
  { key: 'skills-sweeper', job: 'skills_sweeper', schedule: 'every 5m', critical: true },
  { key: 'swarm-resume', job: 'swarm_resume', schedule: 'every 5m', critical: true },
];

export function rosterStats() {
  const r = getRoster();
  return { size: r.length, enabled: r.filter((e) => e.enabled && e.job).length };
}

/** Estimated model calls per day per user at default schedules (upper bound: every run calls the model). */
export const MODEL_JOBS: ReadonlySet<JobType> = new Set(['news_digest', 'opportunity_scan', 'weekly_brief']);
export function estimateDailyModelCalls(roster: readonly RosterEntry[] = getRoster()): { total: number; perJob: Record<string, number> } {
  const perJob: Record<string, number> = {};
  let total = 0;
  for (const e of roster) {
    if (!e.enabled || !e.job || !MODEL_JOBS.has(e.job)) continue;
    const runs = 86_400_000 / intervalOrThrow(e.schedule);
    perJob[e.job] = (perJob[e.job] ?? 0) + runs;
    total += runs;
  }
  return { total, perJob };
}
