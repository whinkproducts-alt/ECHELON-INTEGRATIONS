// Props built by the server page from config/standing-roster.json (the status route does not expose the agent list),
// and the shape of GET /api/worker/status.
export interface RosterAgentView {
  key: string;
  name: string;
  /** firstname.lastname@ staff address, built on the server with staffEmail(). */
  email: string;
  group: string;
  role: string;
  job: string | null;
  schedule: string;
  enabled: boolean;
  modelTier: 'fast' | 'standard' | 'deep';
  kind: 'agent' | 'persona';
}
export interface SystemJobView { key: string; job: string; schedule: string }

export interface WorkerJobRow { jobKey: string; lastRunAt: string | null; lastStatus: string | null; nextRunAt: string; runs: number }
export interface WorkerStatus {
  enabled: boolean;
  heartbeatAgeSeconds: number | null;
  rosterSize: number;
  enabledCount: number;
  jobs: WorkerJobRow[];
}

/** The worker loops every 15 seconds, so a heartbeat older than a minute means it stopped. */
export const STALE_AFTER_SECONDS = 60;
export type Pulse = 'alive' | 'stale' | 'never';
export const pulseOf = (age: number | null): Pulse => (age === null ? 'never' : age <= STALE_AFTER_SECONDS ? 'alive' : 'stale');

export const GROUP_ORDER = [
  'innovation_committee', 'news_desk', 'subsidiary_monitor', 'security_watch', 'memory_curation',
  'executive_office', 'operations', 'finance_watch', 'legal_compliance_watch',
] as const;
export const GROUP_LABEL: Record<string, string> = {
  innovation_committee: 'Innovation committee',
  news_desk: 'News desks',
  subsidiary_monitor: 'Subsidiary monitors',
  security_watch: 'Security watch',
  memory_curation: 'Memory curation',
  executive_office: 'Executive office',
  operations: 'Operations',
  finance_watch: 'Finance',
  legal_compliance_watch: 'Legal',
};
export const groupLabel = (g: string): string => GROUP_LABEL[g] ?? g.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const humanize = (s: string): string => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
