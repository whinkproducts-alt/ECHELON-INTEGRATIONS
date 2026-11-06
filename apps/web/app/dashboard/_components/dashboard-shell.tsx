'use client';

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { MotionConfig } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { PersonaProvider, useDashboardPersona } from '@/components/shell/persona-context';
import { ConversationWorkspaceProvider } from '@/components/shell/conversation-workspace-context';
import { signOut } from 'next-auth/react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { HoloDrawer, HoloOrbBackdrop } from '@/components/ui/holo';
import { CommandPalette, useCommandPaletteHotkey } from '@/components/shell/command-palette';
import { BootSequence } from '@/components/shell/boot-sequence';
import { NavRail } from '@/components/shell/nav-rail';
import { TopBar, type ConnectionState } from '@/components/shell/top-bar';
import { LockdownBanner, LockdownButton, SafetyProvider } from '@/components/safety/lockdown-control';

function subscribeConnection(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
}
const connectionSnapshot = () => navigator.onLine;
const serverConnectionSnapshot = () => true;

export function DashboardShell(props: { children: React.ReactNode; user: any; connection?: ConnectionState }) {
  return <PersonaProvider><ConversationWorkspaceProvider key={props.user?.id ?? props.user?.email}><MotionConfig reducedMotion="user"><DashboardShellContent {...props} /></MotionConfig></ConversationWorkspaceProvider></PersonaProvider>;
}

function DashboardShellContent({ children, user, connection = 'online' }: { children: React.ReactNode; user: any; connection?: ConnectionState }) {
  const pathname = usePathname();
  const tenantConfig = useTenantConfig();
  const [expanded, setExpanded] = useState(true);
  const navTrigger = useRef<HTMLElement | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const paletteTrigger = useRef<HTMLElement | null>(null);
  const offline = !useSyncExternalStore(subscribeConnection, connectionSnapshot, serverConnectionSnapshot);
  const { state: personaState } = useDashboardPersona();

  const openPalette = useCallback((event?: React.MouseEvent<HTMLButtonElement>) => {
    paletteTrigger.current = event?.currentTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPalette(true);
  }, []);
  const togglePalette = useCallback(() => { if (palette) setPalette(false); else openPalette(); }, [palette, openPalette]);
  useCommandPaletteHotkey(togglePalette);

  const isWhink = personaState?.activePersona === 'WHINK';
  const isMamba = personaState?.activePersona === 'MAMBA';
  const personaLabel = isWhink
    ? tenantConfig.productName
    : isMamba
      ? `${tenantConfig.memoryLabelMamba} • ${tenantConfig.obsidianLabel ?? personaState?.mambaMode ?? 'Obsidian'}`
      : personaState?.activePersona ?? 'Agent unavailable';
  // Consumers (neural-link, connected-apps) read --tenant-accent with a token fallback.
  const accentStyle = tenantConfig.accentColor ? ({ '--tenant-accent': tenantConfig.accentColor } as React.CSSProperties) : undefined;
  const signOutNow = () => signOut({ redirectTo: '/login' });

  return (
    <SafetyProvider>
    <div className="dashboard-frame relative flex h-dvh overflow-hidden bg-background" style={accentStyle}>
      <a href="#main-content" className="sr-only z-[70] rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-2 focus:top-2">Skip to content</a>
      <HoloOrbBackdrop stars={60} />

      <aside className={`command-sidebar relative z-20 hidden shrink-0 border-r border-border transition-[width] duration-normal lg:block ${expanded ? 'w-60' : 'w-16'}`} >
        <NavRail pathname={pathname} expanded={expanded} onToggle={() => setExpanded((e) => !e)} onSignOut={signOutNow} />
      </aside>

      <HoloDrawer open={mobileNav} onOpenChange={setMobileNav} side="left" width="18rem" title={tenantConfig.appName} description="Navigation" returnFocusTo={navTrigger}>
        <div className="-mx-6 -mb-6 h-[70vh]">
          <NavRail pathname={pathname} expanded onNavigate={() => setMobileNav(false)} onSignOut={signOutNow} />
        </div>
      </HoloDrawer>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          personaLabel={personaLabel} personaKind={isMamba ? 'adversarial' : 'primary'} functionalMode={personaState?.functionalMode}
          connection={offline ? 'offline' : connection} userEmail={user?.email ?? undefined}
          onOpenPalette={openPalette} onOpenNav={event => {navTrigger.current = event.currentTarget; setMobileNav(true);}}
          actions={<LockdownButton />}
        />
        <LockdownBanner />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto outline-none">{children}</main>
      </div>

      <BootSequence />
      <CommandPalette open={palette} onOpenChange={setPalette} returnFocusTo={paletteTrigger} />
    </div>
    </SafetyProvider>
  );
}
