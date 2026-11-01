import type { JobContext } from '@/lib/worker/context';
import type { JobType } from '@/lib/worker/roster';
import { newsDigest } from '@/lib/worker/jobs/news-digest';
import { opportunityScan, weeklyBrief } from '@/lib/worker/jobs/opportunity';
import { projectMonitor } from '@/lib/worker/jobs/project-monitor';
import { memoryCuration } from '@/lib/worker/jobs/memory-curation';
import { securityWatch } from '@/lib/worker/jobs/security-watch';
import { skillsSweeper } from '@/lib/worker/jobs/skills-sweeper';
import { swarmResume } from '@/lib/worker/jobs/swarm-resume';

export interface JobDef {
  run: (ctx: JobContext) => Promise<void>;
  /** Calls the model router. Skipped when offline with no local fallback. */
  usesModel: boolean;
  /** Critical loops keep running at the soft budget limit (never at the hard limit). */
  critical: boolean;
}

export const JOBS: Readonly<Record<JobType, JobDef>> = {
  news_digest: { run: (c) => newsDigest(c), usesModel: true, critical: false },
  opportunity_scan: { run: opportunityScan, usesModel: true, critical: false },
  weekly_brief: { run: weeklyBrief, usesModel: true, critical: false },
  project_monitor: { run: projectMonitor, usesModel: false, critical: false },
  memory_curation: { run: memoryCuration, usesModel: false, critical: false },
  security_watch: { run: securityWatch, usesModel: false, critical: true },
  skills_sweeper: { run: (c) => skillsSweeper(c), usesModel: false, critical: true },
  swarm_resume: { run: (c) => swarmResume(c), usesModel: false, critical: true },
};
