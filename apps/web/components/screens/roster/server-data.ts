// Server only: reads the standing roster configuration and shapes it for the client screen.
import { estimateDailyModelCalls, getRoster, SYSTEM_JOBS } from '@/lib/worker/roster';
import { staffEmail } from '@/lib/staff-directory';
import type { RosterAgentView, SystemJobView } from './types';

export function getRosterView(): { agents: RosterAgentView[]; systemJobs: SystemJobView[]; dailyModelCalls: number } {
  const roster = getRoster();
  const agents = roster.map((e) => {
    const parts = e.name.trim().split(/\s+/);
    return {
      key: e.key, name: e.name, email: staffEmail(parts[0] ?? '', parts[parts.length - 1] ?? ''), group: e.group, role: e.role,
      job: e.job, schedule: e.schedule, enabled: e.enabled, modelTier: e.modelTier, kind: e.kind,
    };
  });
  return {
    agents,
    systemJobs: SYSTEM_JOBS.map((s) => ({ key: s.key, job: s.job, schedule: s.schedule })),
    dailyModelCalls: estimateDailyModelCalls(roster).total,
  };
}
