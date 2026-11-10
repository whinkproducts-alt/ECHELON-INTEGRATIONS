import { QueryClient } from '@tanstack/react-query';

export const DISPLAY_FRESHNESS_MS = 15_000;

export const DASHBOARD_KEYS = {
  projects: ['dashboard', 'projects'] as const,
  projectDetails: ['dashboard', 'project'] as const,
  tasks: ['dashboard', 'tasks'] as const,
  tenant: ['dashboard', 'tenant-config'] as const,
};

/** Display data only. Every account shell owns a separate, disposable instance. */
export function createDashboardQueryClient() {
  return new QueryClient({ defaultOptions: { queries: {
    staleTime: DISPLAY_FRESHNESS_MS,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: true,
  }, mutations: { retry: false } } });
}
