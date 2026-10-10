'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Zap, MessageSquare, FolderKanban, Brain, CheckSquare,
  Settings, LogOut, Command, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Command', href: '/dashboard', icon: <Command className="h-4 w-4" /> },
  { label: 'Conversation', href: '/dashboard/conversation', icon: <MessageSquare className="h-4 w-4" /> },
  { label: 'Projects', href: '/dashboard/projects', icon: <FolderKanban className="h-4 w-4" /> },
  { label: 'Memory', href: '/dashboard/memory', icon: <Brain className="h-4 w-4" /> },
  { label: 'Tasks', href: '/dashboard/tasks', icon: <CheckSquare className="h-4 w-4" /> },
  { label: 'Settings', href: '/dashboard/settings', icon: <Settings className="h-4 w-4" /> },
];

interface PersonaState {
  activePersona: string;
  mambaMode: string | null;
  functionalMode: string | null;
}

export function DashboardShell({ children, user }: { children: React.ReactNode; user: any }) {
  const pathname = usePathname();
  const tenantConfig = useTenantConfig();
  const [collapsed, setCollapsed] = useState(false);
  const [personaState, setPersonaState] = useState<PersonaState>({
    activePersona: 'WHINK',
    mambaMode: null,
    functionalMode: null,
  });

  useEffect(() => {
    fetch('/api/persona/state')
      .then((r) => r.json())
      .then((data) => {
        if (data?.activePersona) setPersonaState(data);
      })
      .catch(() => {});
  }, [pathname]);

  const isWhink = personaState.activePersona === 'WHINK';
  const accentColor = tenantConfig.accentColor;

  return (
    <div
      className="flex h-screen bg-background overflow-hidden"
      style={{ '--accent-color': accentColor } as React.CSSProperties}
    >
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-card transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
          <Zap className={`h-5 w-5 flex-shrink-0 ${isWhink ? 'text-primary' : 'text-[hsl(var(--mamba-blood))]'}`} />
          {!collapsed && (
            <span className="font-display font-bold text-foreground tracking-tight">{tenantConfig.productName}</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                } ${collapsed ? 'justify-center' : ''}`}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="border-t border-border p-2 space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent w-full transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            onClick={() => signOut({ redirectTo: '/login' })}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-accent w-full transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium ${
              isWhink ? 'bg-primary/10 text-primary' : 'bg-[hsl(var(--mamba-blood)/0.1)] text-[hsl(var(--mamba-blood))]'
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                isWhink ? 'bg-primary animate-pulse-subtle' : 'bg-[hsl(var(--mamba-blood))] animate-pulse-subtle'
              }`} />
              {isWhink ? tenantConfig.productName : `MAMBA • ${personaState.mambaMode ?? 'OBSIDIAN'}`}
            </div>
            {personaState.functionalMode && (
              <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-1 rounded">
                {personaState.functionalMode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono">{user?.email ?? ''}</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
