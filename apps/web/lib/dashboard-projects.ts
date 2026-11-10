import type { QueryClient } from '@tanstack/react-query';
import { dashboardJson } from '@/lib/dashboard-client';
import { DASHBOARD_KEYS } from '@/lib/dashboard-query-cache';

export async function fetchDashboardProjects<T>(signal: AbortSignal): Promise<T[]> {
  const projects = await dashboardJson<T[]>('/api/projects', { signal });
  if (!Array.isArray(projects)) throw new Error('Unexpected service response.');
  return projects;
}

/** Cancel obsolete Monitor work only when no mounted page is using that request. */
export async function readMonitorProjects<T>(client: QueryClient, signal: AbortSignal): Promise<T[]> {
  const cancelUnused = () => {
    const query = client.getQueryCache().find({ queryKey: DASHBOARD_KEYS.projects, exact: true });
    if (query?.getObserversCount() === 0) void client.cancelQueries({ queryKey: DASHBOARD_KEYS.projects, exact: true });
  };
  if (signal.aborted) throw new DOMException('Read cancelled', 'AbortError');
  signal.addEventListener('abort', cancelUnused, { once: true });
  try {
    return await client.fetchQuery({ queryKey: DASHBOARD_KEYS.projects, queryFn: ({ signal: querySignal }) => fetchDashboardProjects<T>(querySignal) });
  } finally { signal.removeEventListener('abort', cancelUnused); }
}
