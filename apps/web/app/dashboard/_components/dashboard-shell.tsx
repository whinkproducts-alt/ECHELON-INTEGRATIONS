'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { HoloDrawer, HoloOrbBackdrop } from '@/components/ui/holo';
import { CommandPalette, useCommandPaletteHotkey } from '@/components/shell/command-palette';
import { BootSequence } from '@/components/shell/boot-sequence';
import { NavRail } from '@/components/shell/nav-rail';
import { TopBar, type ConnectionState } from '@/components/shell/top-bar';

interface PersonaState {
  activePersona: string;
  mambaMode: string | null;
  functionalMode: string | null;
}

export function DashboardShell({ children, user, connection = 'online' }: { children: React.ReactNode; user: any; connection?: ConnectionState }) {
  const pathname = usePathname();
  const tenantConfig = useTenantConfig();
  const [expanded, setExpanded] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [palette, setPalette] = useState(false);
  const [offline, setOffline] = useState(false);
  const [personaState, setPersonaState] = useState<PersonaState>({ activePersona: 'WHINK', mambaMode: null, functionalMode: null });

  useEffect(() => {
    fetch('/api/persona/state')
      .then((r) => r.json())
      .then((data) => {
        if (data?.activePersona) setPersonaState(data);
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    const down = () => setOffline(true);
    const up = () => setOffline(false);
    window.addEventListener('offline', down);
    window.addEventListener('online', up);
    return () => { window.removeEventListener('offline', down); window.removeEventListener('online', up); };
  }, []);

  const togglePalette = useCallback(() => setPalette((p) => !p), []);
  useCommandPaletteHotkey(togglePalette);

  const isWhink = personaState.activePersona === 'WHINK';
  const personaLabel = isWhink
    ? tenantConfig.productName
    : `${tenantConfig.memoryLabelMamba} • ${tenantConfig.obsidianLabel ?? personaState.mambaMode ?? 'Obsidian'}`;
  // Consumers (neural-link, connected-apps) read --tenant-accent with a token fallback.
  const accentStyle = tenantConfig.accentColor ? ({ '--tenant-accent': tenantConfig.accentColor } as React.CSSProperties) : undefined;
  const signOutNow = () => signOut({ redirectTo: '/login' });

  return (
    <div className="relative flex h-screen overflow-hidden bg-background" style={accentStyle}>
      <a href="#main-content" className="sr-only z-[70] rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-2 focus:top-2">Skip to content</a>
      <HoloOrbBackdrop stars={60} />

      <aside className={`relative z-20 hidden shrink-0 border-r border-border transition-[width] duration-normal lg:block ${expanded ? 'w-56' : 'w-16'}`} style={{ background: 'hsl(var(--surface) / 0.7)', backdropFilter: 'blur(14px)' }}>
        <NavRail pathname={pathname} expanded={expanded} onToggle={() => setExpanded((e) => !e)} onSignOut={signOutNow} />
      </aside>

      <HoloDrawer open={mobileNav} onOpenChange={setMobileNav} side="left" width="18rem" title={tenantConfig.appName} description="Navigation">
        <div className="-mx-6 -mb-6 h-[70vh]">
          <NavRail pathname={pathname} expanded onNavigate={() => setMobileNav(false)} onSignOut={signOutNow} />
        </div>
      </HoloDrawer>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          personaLabel={personaLabel} personaKind={isWhink ? 'primary' : 'adversarial'} functionalMode={personaState.functionalMode}
          connection={offline ? 'offline' : connection} userEmail={user?.email ?? undefined}
          onOpenPalette={() => setPalette(true)} onOpenNav={() => setMobileNav(true)}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto outline-none">{children}</main>
      </div>

      <BootSequence />
      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
