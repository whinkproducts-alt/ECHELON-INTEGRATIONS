import { readFile } from 'fs/promises';
import path from 'path';
import { defaultOrgKitRoot, getOrgKit } from '@/lib/agent-loader';
import { WorkforceScreen } from '@/components/screens/workforce/workforce-screen';
import type { WorkforceData, WorkforceDirectorate } from '@/components/screens/workforce/types';

export const dynamic = 'force-dynamic';

async function load(): Promise<{ data: WorkforceData | null; error: string | null }> {
  try {
    const kit = await getOrgKit();
    let directorates: WorkforceDirectorate[] = [];
    try {
      const raw = JSON.parse(await readFile(path.join(defaultOrgKitRoot(), 'organization/whink_group_leadership.json'), 'utf-8')) as { directorates?: WorkforceDirectorate[] };
      directorates = (raw.directorates ?? []).map((d) => ({ name: d.name, director: d.director ?? null, departments: d.departments ?? {} }));
    } catch {
      // Leadership file missing: fall back to directorate names found on the agents.
      directorates = [...new Set(kit.agents.map((a) => a.directorate))].map((name) => ({ name, director: null, departments: {} }));
    }
    return {
      error: null,
      data: {
        directorates,
        manifest: { agentCount: kit.manifest.agent_count, skillCount: kit.skills.length, teamCount: kit.teams.length },
        mismatches: kit.countMismatches,
        agents: kit.agents.map((a) => ({
          id: a.agent_id, name: a.name, title: a.title, directorate: a.directorate, department: a.department, team: a.team,
          state: a.state, autonomy: a.autonomy_level, mission: a.mission, responsibilities: a.responsibilities ?? [], skills: a.skills ?? [],
          approvalsRequiredFor: a.human_approval_required_for ?? [], reportsToHuman: a.reports_to_human,
        })),
      },
    };
  } catch (e) {
    return { data: null, error: e instanceof Error ? 'Roster files could not be read: ' + e.message : 'Roster files could not be read.' };
  }
}

export default async function Page() {
  const { data, error } = await load();
  return <WorkforceScreen data={data} error={error} />;
}
