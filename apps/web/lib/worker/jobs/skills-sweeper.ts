/** skills_sweeper: resumes stalled skill submissions for the job's own user (lib/skills/pipeline). */
import type { JobContext } from '@/lib/worker/context';

type Resume = (opts: { userId?: string }) => Promise<unknown>;
export const SKILLS_MODULES = ['@/lib/skills/pipeline'] as const;

export async function skillsSweeper(ctx: JobContext, load: (spec: string) => Promise<unknown> = (s) => import(/* @vite-ignore */ s)): Promise<void> {
  for (const spec of SKILLS_MODULES) {
    let mod: { resumeStalled?: Resume } | null = null;
    try { mod = (await load(spec)) as { resumeStalled?: Resume }; } catch { mod = null; }
    if (mod && typeof mod.resumeStalled === 'function') {
      await mod.resumeStalled({ userId: ctx.userId });
      return;
    }
  }
  ctx.counters.skipped++; // module not present yet: no-op
}
