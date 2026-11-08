'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isConversationPersona, dashboardJson } from '@/lib/dashboard-client';
import { DISPLAY_FRESHNESS_MS } from '@/lib/dashboard-query-cache';

interface PersonaState {
  activePersona: string;
  isFounder?: boolean;
  mambaMode: string | null;
  functionalMode: string | null;
}

const PersonaContext = createContext<{
  state: PersonaState | null;
  busy: boolean;
  error: string | null;
  select: (persona: string) => Promise<boolean>;
  refresh: (signal?: AbortSignal) => Promise<void>;
} | null>(null);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<PersonaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const switching = useRef(false);
  const lastConfirmed = useRef<number | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const current = ++version.current;
    try {
      const data = await dashboardJson<PersonaState>('/api/persona/state', { signal });
      if (current !== version.current || signal?.aborted) return;
      if (typeof data.activePersona !== 'string') throw new Error('Agent state unavailable.');
      lastConfirmed.current = Date.now();
      setState(data); setError(null);
    } catch {
      if (!signal?.aborted && current === version.current) {
        lastConfirmed.current = null;
        setState(null); setError('Agent state unavailable. Select an available agent to retry.');
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const refreshIfStale = () => {
      if (!switching.current && (lastConfirmed.current === null || Date.now() - lastConfirmed.current >= DISPLAY_FRESHNESS_MS)) void refresh(controller.signal);
    };
    const initial = setTimeout(refreshIfStale, 0);
    const onFocus = refreshIfStale;
    window.addEventListener('focus', onFocus);
    return () => { clearTimeout(initial); controller.abort(); window.removeEventListener('focus', onFocus); };
  }, [pathname, refresh]);

  const select = useCallback(async (persona: string) => {
    if (switching.current || !isConversationPersona(persona)) return false;
    switching.current = true; ++version.current; setBusy(true); setError(null);
    try {
      const data = await dashboardJson<PersonaState>('/api/persona/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, mambaMode: persona === 'MAMBA' ? 'OBSIDIAN' : null }),
      });
      if (data.activePersona !== persona) throw new Error('Agent selection was not confirmed.');
      // Switch response omits founder metadata; retain only the previously confirmed flag.
      lastConfirmed.current = Date.now();
      setState(previous => ({ ...data, isFounder: previous?.isFounder }));
      return true;
    } catch {
      // The write may have reached the server. Do not keep claiming the previous state.
      lastConfirmed.current = null;
      setState(null); setError('Agent selection could not be confirmed. Select an available agent to retry.');
      return false;
    } finally { switching.current = false; setBusy(false); }
  }, []);

  return <PersonaContext.Provider value={{ state, busy, error, select, refresh }}>{children}</PersonaContext.Provider>;
}

export function useDashboardPersona() {
  const context = useContext(PersonaContext);
  if (!context) throw new Error('Dashboard persona provider is required.');
  return context;
}
