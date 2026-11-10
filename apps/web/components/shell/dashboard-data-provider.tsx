'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createDashboardQueryClient } from '@/lib/dashboard-query-cache';

const DashboardDataContext = createContext<QueryClient | null>(null);

export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createDashboardQueryClient);
  useEffect(() => () => { client.clear(); }, [client]);
  return <DashboardDataContext.Provider value={client}><QueryClientProvider client={client}>{children}</QueryClientProvider></DashboardDataContext.Provider>;
}

/** Public/preview consumers get an isolated client, never the authenticated cache. */
export function useDashboardDataClient() {
  const shared = useContext(DashboardDataContext);
  const [local] = useState(createDashboardQueryClient);
  return shared ?? local;
}
