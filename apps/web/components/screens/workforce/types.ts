// Serialisable workforce data built on the server from packages/org-kit (see app/dashboard/workforce/page.tsx).
export interface WorkforceAgent {
  id: string;
  name: string;
  title: string;
  directorate: string;
  department: string;
  team: string;
  state: string;
  autonomy: number;
  mission: string;
  responsibilities: string[];
  skills: string[];
  approvalsRequiredFor: string[];
  reportsToHuman: string;
}

export interface WorkforceDirectorate {
  name: string;
  director: string | null;
  departments: Record<string, string>;
}

export interface WorkforceData {
  agents: WorkforceAgent[];
  directorates: WorkforceDirectorate[];
  manifest: { agentCount: number; skillCount: number; teamCount: number };
  mismatches: string[];
}
