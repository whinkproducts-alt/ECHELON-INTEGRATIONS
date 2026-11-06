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
  memory: () => import('@/app/dashboard/memory/_components/memory-surface').then(m => ({default:m.MemorySurface})),
  projects: () => import('@/app/dashboard/projects/_components/projects-surface').then(m => ({default:m.ProjectsSurface})),
  tasks: () => import('@/app/dashboard/tasks/_components/tasks-surface').then(m => ({default:m.TasksSurface})),
  settings: () => import('@/app/dashboard/settings/_components/settings-surface').then(m => ({default:m.SettingsSurface})),
  integrations: () => import('@/app/dashboard/integrations/_components/integration-hub').then(m => ({default:m.IntegrationHub})),
  'kill-team': () => import('@/components/screens/kill-team/kill-team-screen').then(m => ({default:() => <m.KillTeamScreen founder={false} />})),
  holo: () => import('@/components/holo/holo-surface').then(m => ({default:m.HoloSurface})),
  news: () => import('@/components/holo/news-surface').then(m => ({default:m.NewsSurface})),
  documents: () => import('@/app/dashboard/documents/_components/upload-panel').then(m => ({default:() => <div className="p-6 max-w-3xl mx-auto space-y-6"><h1 className="font-display text-2xl">Documents</h1><p className="text-sm text-muted-foreground">Upload documents to include in recall. Answers will cite the source and page.</p><m.UploadPanel /></div>})),
  billing: () => import('@/app/dashboard/settings/billing/_components/billing-surface').then(m => ({default:() => <div className="p-6 max-w-3xl mx-auto space-y-6"><h1 className="font-display text-2xl">Billing</h1><m.BillingSurface /></div>})),
  'connected-apps': () => import('@/app/dashboard/settings/connected-apps/_components/connected-apps-surface').then(m => ({default:() => <div className="p-6 max-w-3xl mx-auto space-y-6"><m.ConnectedAppsSurface initialNotice={null} /></div>})),
  conversation: () => import('@/app/dashboard/conversation/_components/conversation-surface').then(m => ({default:m.ConversationSurface})),
  presence: () => import('@/components/holo/presence-surface').then(m => ({default:m.PresenceSurface})),
  obsidian: () => import('@/components/holo/obsidian-surface').then(m => ({default:m.ObsidianSurface})),
  dashboard: () => import('@/components/premium/ECHELONDashboard').then((m) => ({ default: m.ECHELONDashboard })),
  connectors: () => import('@/components/screens/connectors/connectors-screen'),
  usage: () => import('@/components/screens/usage/usage-screen'),
  security: () => import('@/components/screens/security/security-screen'),
  contacts: () => import('@/components/screens/contacts/contacts-screen'),
  anatomy: () => import('@/components/screens/anatomy/kernel-screen'),
  today: () => import('@/components/screens/today/today-screen'),
  command: () => import('@/app/dashboard/_components/command-surface').then((m) => ({ default: m.CommandSurface })),
  // Owned by another agent; export and prop names are not final. A missing module shows "Screen failed to load".
  subsidiaries: () => import('@/components/screens/subsidiaries/subsidiaries-screen'),
  subsidiary: () => import('@/components/screens/subsidiaries/subsidiary-screen'),
  'project-report': () => import('@/components/screens/subsidiaries/project-report-screen'),
  passkeys: () => import('@/app/dashboard/settings/_components/passkeys-panel').then((m) => ({ default: () => <div className="mx-auto max-w-3xl p-4 sm:p-8"><m.PasskeysPanel /></div> })),
  approvals: () => import('@/components/screens/approvals/approvals-screen'),
  ledger: () => import('@/components/screens/ledger/ledger-screen'),
  system: () => import('@/components/screens/system/system-screen'),
  meeting: () => import('@/components/screens/meeting/meeting-screen'),
  skills: () => import('@/components/screens/skills/skills-screen'),
  swarm: () => import('@/components/screens/swarm/swarm-screen'),
  'swarm-run': () => import('@/components/screens/swarm/run-screen'),
  contracts: () => import('@/components/screens/contracts/contracts-screen'),
  contract: () => import('@/components/screens/contracts/contract-detail-screen'),
  finance: () => import('@/components/screens/finance/finance-screen'),
  'change-requests': () => import('@/components/screens/change-requests/change-requests-screen'),
  'change-request': () => import('@/components/screens/change-requests/change-request-detail-screen'),
  // Public pages. Rendered inside the shell frame for preview only. For the reset form open /dev-preview/reset-password?token=sample&state=ready.
  landing: () => import('@/components/screens/landing/landing-screen'),
  'forgot-password': () => import('@/app/forgot-password/_components/forgot-form').then((m) => ({ default: m.ForgotForm })),
  'reset-password': () => import('@/app/reset-password/_components/reset-form').then((m) => ({ default: m.ResetForm })),
};
export const SERVER_SCREENS = ['board', 'directory', 'workforce', 'companies', 'roster'] as const;
export const ALL_SCREENS = [...SERVER_SCREENS, ...Object.keys(LOADERS)];

const STATES: PreviewState[] = ['ready', 'loading', 'error', 'empty'];

type ScreenProps = Record<string, unknown>;

function pickComponent(mod: Record<string, unknown>): React.ComponentType<Record<string, unknown>> | null {
  const named = Object.keys(mod).find((k) => /Screen$/.test(k) && typeof mod[k] === 'function');
  const c = named ? mod[named] : mod.default;
  return typeof c === 'function' ? (c as React.ComponentType<Record<string, unknown>>) : null;
}

function Loaded({ id, ids, extra }: { id: string; ids: ScreenProps; extra?: Record<string, unknown> }) {
  const load = LOADERS[id];
  const [phase, setPhase] = React.useState<{ kind: 'loading' } | { kind: 'missing'; why: string } | { kind: 'ready'; C: React.ComponentType<Record<string, unknown>> }>({ kind: 'loading' });
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
  return <C {...ids} {...extra} />;
}

export function PreviewClient({ screen, state, entityId, extraProps, children }: { screen: string; state: PreviewState; entityId?: string; extraProps?: Record<string, unknown>; children?: React.ReactNode }) {
  // Fixture ids for the subsidiaries screens. Prop names are passed under every likely name so the screens can pick theirs.
  const ids: ScreenProps = screen === 'project-report'
    ? { id: entityId ?? 'prj_consult_1', projectId: entityId ?? 'prj_consult_1', subsidiaryId: 'consult' }
    : { id: entityId ?? 'consult', subsidiaryId: entityId ?? 'consult' };
  const q = entityId ? `&id=${encodeURIComponent(entityId)}` : '';
  // Remount (and re-install the mock) whenever the state changes.
  return (
    <MockFetch key={state} state={state} screen={screen}>
      <DashboardShell user={{ email: 'dev.preview@example.test' }}>
        <div className={['dashboard','conversation','presence','obsidian'].includes(screen) ? 'flex h-full min-h-0 flex-col' : undefined}>
        <div className="shrink-0 border-b border-border bg-background/60 px-4 py-2 sm:px-8">
          <p className="mb-1 font-mono text-[0.625rem] uppercase tracking-[0.25em] text-muted-foreground">Dev preview, fixtures only</p>
          <nav aria-label="Preview state" className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <a key={s} href={`/dev-preview/${screen}?state=${s}${q}`} aria-current={s === state ? 'page' : undefined}
                className="rounded-full border border-border px-3 py-0.5 font-mono text-xs text-muted-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground">{s}</a>
            ))}
          </nav>
        </div>
        <div className={['dashboard','conversation','presence','obsidian'].includes(screen) ? 'min-h-0 flex-1' : undefined}>{children ?? <Loaded id={screen} ids={ids} extra={extraProps} />}</div>
        </div>
      </DashboardShell>
    </MockFetch>
  );
}
