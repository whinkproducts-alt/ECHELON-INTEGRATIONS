'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PersonaType } from '@/lib/personas';
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
  const [activePersona, setActivePersona] = useState<PersonaType>('WHINK');

  const openConversation = useCallback(() => setView('conversation'), []);
  const openBoard = useCallback(() => setView('board'), []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Segmented view switch — small, text-only, sits under the top bar */}
      <div className="shrink-0 border-b border-border px-5 sm:px-8">
        <nav className="-mb-px flex gap-6" aria-label="Dashboard view">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              aria-current={view === t.id ? 'page' : undefined}
              className={`relative py-3 font-mono text-xs uppercase tracking-[0.14em] transition-colors ${
                view === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {view === t.id && (
                <motion.span
                  layoutId="dash-tab"
                  className="absolute inset-x-0 -bottom-px h-px bg-[hsl(var(--whink-accent))]"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          {view === 'monitor' && (
            <motion.div
              key="monitor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <DashboardMonitor onOpenConversation={openConversation} onOpenBoard={openBoard} />
            </motion.div>
          )}
          {view === 'conversation' && (
            <motion.div
              key="conversation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <PremiumConversation activePersona={activePersona} onPersonaChange={setActivePersona} />
            </motion.div>
          )}
          {view === 'board' && (
            <motion.div
              key="board"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <PremiumBoard activePersona={activePersona} onSelect={(p) => { setActivePersona(p); setView('conversation'); }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}