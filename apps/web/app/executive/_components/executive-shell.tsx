'use client';

import { MotionConfig } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { DashboardDataProvider } from '@/components/shell/dashboard-data-provider';
import { PersonaProvider, useDashboardPersona } from '@/components/shell/persona-context';
import { ConversationWorkspaceProvider } from '@/components/shell/conversation-workspace-context';
import { SafetyProvider, LockdownBanner } from '@/components/safety/lockdown-control';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import Link from 'next/link';

interface ExecutiveShellProps {
  children: React.ReactNode;
  user: any;
}

export function ExecutiveShell({ children, user }: ExecutiveShellProps) {
  return (
    <DashboardDataProvider key={user?.id ?? user?.email}>
      <PersonaProvider>
        <ConversationWorkspaceProvider>
          <MotionConfig reducedMotion="user">
            <ExecutiveShellContent user={user}>
              {children}
            </ExecutiveShellContent>
          </MotionConfig>
        </ConversationWorkspaceProvider>
      </PersonaProvider>
    </DashboardDataProvider>
  );
}

function ExecutiveShellContent({ children, user }: ExecutiveShellProps) {
  const pathname = usePathname();
  const tenantConfig = useTenantConfig();
  const { state: personaState } = useDashboardPersona();
  const accentStyle = tenantConfig.accentColor ? ({ '--tenant-accent': tenantConfig.accentColor } as React.CSSProperties) : undefined;
  const productName = tenantConfig.productName ?? 'ECHELON';

  const isExecutiveRoute = pathname.startsWith('/executive/');

  const executiveNavItems = [
    { label: 'Holo', href: '/executive/holo', icon: '⬟' },
    { label: 'Corporate', href: '/executive/corporate', icon: '▢' },
    { label: 'Office', href: '/executive/office', icon: '⬠' },
    { label: 'Dashboard', href: '/dashboard', icon: '◈' },
  ];

  return (
    <SafetyProvider>
      <div className="executive-frame relative flex h-dvh overflow-hidden bg-background" style={accentStyle}>
        <a href="#main-content" className="sr-only z-[70] rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:left-2 focus:top-2">Skip to content</a>
        
        <aside className="executive-sidebar relative z-20 hidden shrink-0 border-r border-border transition-[width] duration-normal lg:block w-64 bg-[hsl(var(--base))]" >
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between px-4 border-b border-border">
              <Link href="/executive/holo" className="flex items-center gap-2" aria-label={`${productName} Executive`}>
                <span className="font-display font-bold text-lg tracking-widest uppercase" style={{ color: 'hsl(var(--whink-accent))' }}>
                  EXECUTIVE
                </span>
              </Link>
            </div>
            
            <nav className="flex-1 overflow-y-auto p-4 space-y-1" aria-label="Executive navigation">
              {executiveNavItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/executive/holo' && pathname.startsWith(item.href + '/'));
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[hsl(var(--whink-accent)/0.15)] text-[hsl(var(--whink-accent))] border border-[hsl(var(--whink-accent)/0.3)]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--accent)/0.08)]'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="text-xl" aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border p-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--accent)/0.08)] transition-colors"
              >
                <span className="text-xl" aria-hidden>◈</span>
                Dashboard
              </Link>
            </div>
          </div>
        </aside>

        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="executive-header flex h-16 shrink-0 items-center justify-between px-6 border-b border-border bg-[hsl(var(--base)/0.8)] backdrop-blur-md">
            <div className="flex items-center gap-4">
              <span className="font-display font-bold text-xl tracking-widest uppercase" style={{ color: 'hsl(var(--whink-accent))' }}>
                EXECUTIVE
              </span>
              <span className="hidden md:block w-px h-6 bg-border" />
              <span className="text-sm text-muted-foreground">
                {pathname === '/executive/holo' && 'Holographic Dashboard'}
                {pathname === '/executive/corporate' && 'Corporate Dashboard'}
                {pathname === '/executive/office' && 'Founder Office'}
                {pathname.startsWith('/executive/office/marcus') && 'Marcus Vale'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <LockdownBanner />
              <span className="text-xs text-muted-foreground">{user?.email ?? ''}</span>
            </div>
          </header>
          <LockdownBanner />
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto outline-none p-6">
            {children}
          </main>
        </div>
      </div>
    </SafetyProvider>
  );
}