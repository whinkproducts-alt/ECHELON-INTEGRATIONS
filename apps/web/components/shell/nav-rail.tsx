'use client';
// NavRail props: pathname: string|null, expanded?: boolean, onToggle?: ()=>void, onNavigate?: ()=>void, onSignOut: ()=>void.
// Renders NAV_GROUPS/NAV_ITEMS from nav-config.ts. Slim (icons) by default, labels when expanded. Active item has a glowing marker.
import * as React from 'react';
import Link from 'next/link';
import { ChevronsLeft, ChevronsRight, LogOut, PanelsTopLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { activeNavId, navByGroup } from './nav-config';

export function NavRail({ pathname, expanded = false, onToggle, onNavigate, onSignOut }: {
  pathname: string | null; expanded?: boolean; onToggle?: () => void; onNavigate?: () => void; onSignOut: () => void;
}) {
  const active = activeNavId(pathname);
  const groups = navByGroup();
  return (
    <nav aria-label="Main" className="command-navigation flex h-full flex-col" data-expanded={expanded}>
      <div className="command-navigation-header"><PanelsTopLeft size={18} aria-hidden />{expanded && <span>Workspace</span>}</div>
      <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-2 py-3">
        {groups.map(({ group, items }) => (
          <div key={group.id} role="group" aria-label={group.label}>
            {expanded ? (
              <p className="px-3 pb-1 font-mono text-[0.625rem] uppercase tracking-[0.25em] text-muted-foreground">{group.label}</p>
            ) : (
              <div className="mx-3 mb-1.5 h-px bg-border" aria-hidden />
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href} onClick={onNavigate} aria-current={isActive ? 'page' : undefined}
                      title={expanded ? undefined : item.label} aria-label={expanded ? undefined : item.label}
                      className={cn(
                        'group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                        isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        !expanded && 'justify-center px-0',
                      )}
                    >
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" style={{ boxShadow: '0 0 10px hsl(var(--whink-accent))' }} aria-hidden />}
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      {expanded && <span className="truncate">{item.label}</span>}
                      {expanded && item.status === 'soon' && <span className="ml-auto font-mono text-[0.5625rem] uppercase tracking-widest text-muted-foreground">Soon</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="space-y-0.5 border-t border-border p-2">
        {onToggle && (
          <button type="button" onClick={onToggle} aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'} className={cn('flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring', !expanded && 'justify-center px-0')}>
            {expanded ? <ChevronsLeft className="h-4 w-4" aria-hidden /> : <ChevronsRight className="h-4 w-4" aria-hidden />}
            {expanded && <span>Collapse</span>}
          </button>
        )}
        <button type="button" onClick={onSignOut} aria-label="Sign out" className={cn('flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring', !expanded && 'justify-center px-0')}>
          <LogOut className="h-4 w-4" aria-hidden />
          {expanded && <span>Sign out</span>}
        </button>
      </div>
    </nav>
  );
}
