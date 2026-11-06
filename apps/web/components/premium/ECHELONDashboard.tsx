'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Activity, MessageSquare, Users, Orbit, ArrowUpRight } from 'lucide-react';
import { PERSONAS, type PersonaType } from '@/lib/personas';
import { useDashboardPersona } from '@/components/shell/persona-context';
import { DashboardMonitor } from './DashboardMonitor';
import { PremiumConversation } from './PremiumConversation';
import { PremiumBoard } from './PremiumBoard';

type View = 'monitor' | 'conversation' | 'board';

const TABS: Array<{ id: View; label: string }> = [
  { id: 'monitor', label: 'Monitor' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'board', label: 'Board' },
];

/**
 * Dashboard content. Renders inside the existing DashboardShell (nav rail,
 * top bar, persona state), so this component owns no chrome and no page
 * background. Default view is the operations monitor.
 */
export function ECHELONDashboard() {
  const [view, setView] = useState<View>('monitor');
  const persona = useDashboardPersona();
  const [conversationBusy, setConversationBusy] = useState(false);
  const activePersona = persona.state?.activePersona && persona.state.activePersona in PERSONAS
    ? persona.state.activePersona as PersonaType : null;
  const choosePersona = async (p: PersonaType) => {
    if (!conversationBusy && await persona.select(p)) setView('conversation');
  };

  const openConversation = useCallback(() => setView('conversation'), []);

  return (
    <div className="executive-workspace flex h-full min-h-0 flex-col">
      <div className="workspace-switcher">
        <span className="workspace-switcher-label">Executive workspace</span>
        <nav aria-label="Dashboard view" className="workspace-tabs">
          {TABS.map((t) => {
            const Icon = t.id === 'monitor' ? Activity : t.id === 'conversation' ? MessageSquare : Users;
            return <button key={t.id} type="button" onClick={() => setView(t.id)} aria-current={view === t.id ? 'page' : undefined}
              className="workspace-tab"><Icon size={16} aria-hidden /><span>{t.label}</span></button>;
          })}
        </nav>
        <Link href="/dashboard/holo" aria-label="Enter HOLO" className="workspace-holo-link"><Orbit size={16} aria-hidden /><span>Enter HOLO</span><ArrowUpRight size={14} aria-hidden /></Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div hidden={view !== 'monitor'}>
          <DashboardMonitor onOpenConversation={openConversation} />
        </div>
        <div hidden={view !== 'conversation'} className="h-full">
          <PremiumConversation activePersona={activePersona} onPersonaChange={choosePersona} personaBusy={persona.busy} personaError={persona.error} onSendingChange={setConversationBusy} onComplete={persona.refresh} />
        </div>
        <div hidden={view !== 'board'}>
          <PremiumBoard activePersona={activePersona} onSelect={choosePersona} busy={persona.busy || conversationBusy} />
        </div>
      </div>
    </div>
  );
}