// Client-safe subsidiary lookup. Reads config/subsidiaries.json directly (same pattern as components/brand/companies.ts)
// so client components never import server-only code from lib/subsidiaries.ts.
import subsidiariesJson from '@/config/subsidiaries.json';

export interface SubsidiaryInfo {
  id: string;
  name: string;
  logo: string;
}

type Raw = { id: string; name: string; logo?: string };
const raw: unknown = subsidiariesJson;
const rows: Raw[] = Array.isArray(raw) ? (raw as Raw[]) : ((raw as { subsidiaries?: Raw[] })?.subsidiaries ?? []);

const LIST: SubsidiaryInfo[] = rows.map((r) => ({ id: r.id, name: r.name, logo: r.logo ?? `/brand/subsidiaries/${r.id}.webp` }));
const MAP: Record<string, SubsidiaryInfo> = Object.fromEntries(LIST.map((s) => [s.id, s]));

export function getSubsidiaryList(): SubsidiaryInfo[] {
  return LIST;
}

/** Map of id to info. */
export function getSubsidiaryMap(): Record<string, SubsidiaryInfo> {
  return MAP;
}

export function findSubsidiary(id: string | null | undefined): SubsidiaryInfo | null {
  return id ? (MAP[id] ?? null) : null;
}

/** Full report URL for a project: the subsidiary page when assigned, the plain project page otherwise. */
export function projectReportHref(projectId: string, subsidiaryId: string | null | undefined): string {
  return subsidiaryId && MAP[subsidiaryId]
    ? `/dashboard/subsidiaries/${subsidiaryId}/projects/${projectId}`
    : `/dashboard/projects/${projectId}`;
}
