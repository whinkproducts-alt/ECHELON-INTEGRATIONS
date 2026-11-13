/**
 * worker/roster.ts  — FULL REPLACEMENT
 *
 * Changes vs original:
 *   1. Added 'monthly_budget_report' to JOB_TYPES
 *   2. Added monthly-budget-report entry to SYSTEM_JOBS (1st-of-month, 06:00 UTC)
 *
 * Everything else is preserved exactly as confirmed from the repo read.
 */

import { z } from 'zod';

export const JOB_TYPES = [
  'news_digest',
  'opportunity_scan',
  'weekly_brief',
  'project_monitor',
  'memory_curation',
  'security_watch',
  'skills_sweeper',
  'swarm_resume',
  'self_improvement',
  'monthly_budget_report',   // ← ADDED
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export interface RosterEntry {
  job: JobType;
  schedule: string;
  enabled?: boolean;
}

export const rosterEntrySchema = z.object({
  job: z.enum(JOB_TYPES),
  schedule: z.string(),
  enabled: z.boolean().optional(),
});

export interface SystemJob {
  key: string;
  job: JobType;
  schedule: string;
  critical: true;
}

export const SYSTEM_JOBS: readonly SystemJob[] = [
  {
    key: 'skills-sweeper',
    job: 'skills_sweeper',
    schedule: 'every 5m',
    critical: true,
  },
  {
    key: 'swarm-resume',
    job: 'swarm_resume',
    schedule: 'every 5m',
    critical: true,
  },
  {
    // Runs at 06:00 UTC on the 1st of every month.
    // The job reports on the PREVIOUS month's spend.
    key: 'monthly-budget-report',
    job: 'monthly_budget_report',
    schedule: '0 6 1 * *',
    critical: true,
  },
];
