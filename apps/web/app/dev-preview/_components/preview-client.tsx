'use client';
// DEV ONLY. Renders a screen inside the real DashboardShell with mocked /api answers.
// Screens are loaded by a templated dynamic import, so a screen another agent has not built yet only costs a
// "not built yet" panel, never a build error.
import * as React from 'react';
import { DashboardShell } from '@/app/dashboard/_components/dashboard-shell';
import { HoloEmpty } from '@/components/ui/holo';
import { MockFetch } from './mock-fetch';
import type { PreviewState } from './fixtures';

type Loader = () => Promise<Record<string, unknown>>;
/** Client screens, loaded through explicit imports. Server-prop screens arrive as children from the page. */
const LOADERS: Record<string, Loader> = {
  connectors: () => import('@/components/screens/connectors/connectors-screen'),
  usage: () => import('@/components/screens/usage/usage-screen'),
  security: () => import('@/components/screens/security/security-screen'),
  contacts: () => import('@/components/screens/contacts/contacts-screen'),
  anatomy: () => import('@/components/screens/anatomy/kernel-screen'),
  today: () => import('@/components/screens/today/today-screen'),
};
export const SERVER_SCREENS = ['board', 'directory', 'workforce', 'companies'] as const;
export const ALL_SCREENS = [...SERVER_SCREENS, ...Object.keys(LOADERS)];

const STATES: PreviewState[] = ['ready', 'loading', 'error', 'empty'];

function pickComponent(mod: Record<string, unknown>): React.ComponentType | null {
  const named = Object.keys(mod).find((k) => /Screen$/.test(k) && typeof mod[k] === 'function');
  const c = named ? mod[named] : mod.default;
  return typeof c === 'function' ? (c as React.ComponentType) : null;
}

function Loaded({ id }: { id: string }) {
  const load = LOADERS[id];
  const [phase, setPhase] = React.useState<{ kind: 'loading' } | { kind: 'missing'; why: string } | { kind: 'ready'; C: React.ComponentType }>({ kind: 'loading' });
  React.useEffect(() => {
    let live = true;
    if (!load) return;
    load()
      .then((mod) => {
        const C = pickComponent(mod);
        if (live) setPhase(C ? { kind: 'ready', C } : { kind: 'missing', why: 'no exported screen component' });
      })
      .catch((e: unknown) => { if (live) setPhase({ kind: 'missing', why: e instanceof Error ? e.message : 'import failed' }); });
    return () => { live = false; };
  }, [load]);
  if (!load) return <HoloEmpty state="error" title="Unknown screen" description={`Known screens: ${ALL_SCREENS.join(', ')}.`} />;
  if (phase.kind === 'loading') return <div className="p-8"><HoloEmpty state="loading" title="Loading screen" /></div>;
  if (phase.kind === 'missing') return <div className="p-8"><HoloEmpty state="error" title="Screen failed to load" description={`${id}: ${phase.why}`} /></div>;
  const C = phase.C;
  return <C />;
}

export function PreviewClient({ screen, state, children }: { screen: string; state: PreviewState; children?: React.ReactNode }) {
  // Remount (and re-install the mock) whenever the state changes.
  return (
    <MockFetch key={state} state={state}>
      <DashboardShell user={{ email: 'dev.preview@example.test' }}>
        <div className="border-b border-border bg-background/60 px-4 py-2 sm:px-8">
          <p className="mb-1 font-mono text-[0.625rem] uppercase tracking-[0.25em] text-muted-foreground">Dev preview, fixtures only</p>
          <nav aria-label="Preview state" className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <a key={s} href={`/dev-preview/${screen}?state=${s}`} aria-current={s === state ? 'page' : undefined}
                className="rounded-full border border-border px-3 py-0.5 font-mono text-xs text-muted-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground">{s}</a>
            ))}
          </nav>
        </div>
        {children ?? <Loaded id={screen} />}
      </DashboardShell>
    </MockFetch>
  );
}
