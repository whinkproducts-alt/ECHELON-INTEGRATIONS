// Shapes served by /api/subsidiaries, /api/subsidiaries/[id]/projects and /api/projects/[id]/report.
// All free text is untrusted: render as React text only.
export type SubsidiaryId = 'consult' | 'real-estate' | 'trades' | 'apps' | 'frontliners';

export interface SubsidiaryInfo {
  id: SubsidiaryId;
  name: string;
  logo: string;
  intro: string;
  about: string;
  services: Array<{ title: string; description: string }>;
  location: string | null;
  notice: string | null;
  directors: Array<{ name: string; title: string; imageUrl: string | null; boardId: string | null }>;
}

export interface ProjectCardData {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  subsidiary: string | null;
  updatedAt: string;
  progress: { tasksTotal: number; tasksDone: number; percent: number };
  nextMilestone: { title: string; dueDate: string | null } | null;
  openRisks: number;
  openQuestions: number;
}

export interface SubsidiarySummary {
  id: string;
  name: string;
  logo: string;
  counts: { total: number; active: number };
  openTasks: number;
  openRisks: number;
  nextMilestone: { title: string; dueDate: string | null; projectId: string; projectName: string } | null;
}
export interface SubsidiariesResponse { subsidiaries: SubsidiarySummary[]; unassigned: { total: number; active: number } }
export interface SubsidiaryProjectsResponse { subsidiary: { id: string; name: string }; projects: ProjectCardData[] }

export interface ReportTask { id: string; title: string; description?: string | null; status: string; priority?: string | null; assignee?: string | null; dueDate?: string | null; notes?: string | null }
export interface ReportMilestone { id: string; title: string; description?: string | null; status: string; targetDate?: string | null; completedAt?: string | null }
export interface ReportDecision { id: string; title: string; description?: string | null; rationale?: string | null; decidedBy?: string | null; decidedAt?: string | null; status?: string | null }
export interface ReportRisk { id: string; title: string; description?: string | null; severity?: string | null; likelihood?: string | null; mitigation?: string | null; status?: string | null }
export interface ReportQuestion { id: string; question: string; context?: string | null; assignedTo?: string | null; status?: string | null; answer?: string | null; answeredAt?: string | null }
export interface ReportMember { userId: string; role: string; name: string | null }
export interface ProjectReport {
  project: { id: string; name: string; goal: string | null; description: string | null; status: string; subsidiary: string | null; createdAt: string; updatedAt: string };
  subsidiary: { id: string; name: string; logo: string } | null;
  progress: { tasksTotal: number; tasksDone: number; percent: number };
  tasks: ReportTask[];
  milestones: ReportMilestone[];
  decisions: ReportDecision[];
  risks: ReportRisk[];
  openQuestions: ReportQuestion[];
  members: ReportMember[];
}
