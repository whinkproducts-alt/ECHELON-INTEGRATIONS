'use client';
// TopBar props: personaLabel: string, personaKind: 'primary'|'adversarial', functionalMode?: string|null, connection?: 'online'|'degraded'|'offline' (read-only),
// userEmail?: string, onOpenPalette: ()=>void, onOpenNav?: ()=>void (mobile menu), actions?: ReactNode (e.g. the lockdown control). Clock renders only after mount.
import * as React from 'react';
import Link from 'next/link';
import { Menu, Search } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { ClientOnly } from '@/components/client-only';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { HoloBadge, type HoloTone } from '@/components/ui/holo';
import { InstallPrompt } from './install-prompt';

export type ConnectionState = 'online' | 'degraded' | 'offline';

const CONNECTION: Record<ConnectionState, { tone: HoloTone; label: string }> = {
  online: { tone: 'accent', label: 'Online' },
  degraded: { tone: 'amber', label: 'Degraded' },
  offline: { tone: 'ember', label: 'Offline' },
};

function Clock() {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);
  const time = now ? now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '--:--:--';
  const date = now ? now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  return (
    <div className="hidden text-right leading-tight sm:block" aria-label="Local time">
      <div className="font-mono text-sm tabular-nums text-foreground">{time}</div>
      <div className="font-mono text-[0.625rem] uppercase tracking-widest text-muted-foreground">{date}</div>
    </div>
  );
}

export function TopBar({ personaLabel, personaKind, functionalMode, connection = 'online', userEmail, onOpenPalette, onOpenNav, actions }: {
  personaLabel: string; personaKind: 'primary' | 'adversarial'; functionalMode?: string | null; connection?: ConnectionState;
  userEmail?: string; onOpenPalette: () => void; onOpenNav?: () => void; actions?: React.ReactNode;
}) {
  const { appName } = useTenantConfig();
  const conn = CONNECTION[connection];
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-5" style={{ background: 'hsl(var(--surface) / 0.7)', backdropFilter: 'blur(14px)' }}>
      {onOpenNav && (
        <button type="button" onClick={onOpenNav} aria-label="Open navigation" className="rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring lg:hidden">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      )}
      <Link href="/dashboard" className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" aria-label={`${appName} home`}>
        <BrandMark company="ultimate" size={40} crop="glyph" interactive={false} />
        <span className="hidden font-display text-sm font-semibold tracking-[0.18em] text-foreground md:inline">{appName}</span>
      </Link>

      <button type="button" onClick={onOpenPalette} className="mx-auto hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-border px-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:flex" aria-label="Open command palette">
        <Search className="h-4 w-4" aria-hidden />
        <span className="flex-1">Go to...</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.625rem]">Ctrl K</kbd>
      </button>
      <button type="button" onClick={onOpenPalette} className="ml-auto rounded-md p-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:hidden" aria-label="Open command palette">
        <Search className="h-5 w-5" aria-hidden />
      </button>

      <div className="flex items-center gap-2 sm:gap-3">
        <InstallPrompt className="hidden md:inline-flex" />
        {actions}
        <HoloBadge tone={personaKind === 'primary' ? 'accent' : 'mamba'} dot pulse>{personaLabel}</HoloBadge>
        {functionalMode && <span className="hidden rounded bg-secondary px-2 py-1 font-mono text-xs text-muted-foreground lg:inline">{functionalMode}</span>}
        <HoloBadge tone={conn.tone} dot pulse={connection !== 'online'}>{conn.label}</HoloBadge>
        <ClientOnly fallback={<div className="hidden h-8 w-20 sm:block" />}><Clock /></ClientOnly>
        {userEmail && <span className="hidden max-w-[12rem] truncate font-mono text-xs text-muted-foreground xl:inline">{userEmail}</span>}
      </div>
    </header>
  );
}
