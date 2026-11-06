'use client';
// CommandPalette props: open: boolean, onOpenChange: (open)=>void. Lists every route in nav-config.ts, filtered by label, description and keywords.
// Arrow keys move, Enter navigates, Escape closes. Open it with useCommandPaletteHotkey (Cmd/Ctrl+K).
import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, NAV_ITEMS, type NavItem } from './nav-config';

export function useCommandPaletteHotkey(toggle: () => void) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
}

function score(item: NavItem, q: string): number {
  if (!q) return 1;
  const hay = [item.label, item.description, ...(item.keywords ?? [])].join(' ').toLowerCase();
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 3;
  if (label.includes(q)) return 2;
  return q.split(/\s+/).every((w) => hay.includes(w)) ? 1 : 0;
}

export function CommandPalette({ open, onOpenChange, returnFocusTo }: { open: boolean; onOpenChange: (o: boolean) => void; returnFocusTo?: React.RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const [query, setQuery] = React.useState('');
  const [index, setIndex] = React.useState(0);
  const uid = React.useId();
  const q = query.trim().toLowerCase();
  const results = React.useMemo(
    () => NAV_ITEMS.map((i) => ({ i, s: score(i, q) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).map((r) => r.i),
    [q],
  );
  const go = (item: NavItem) => {
    onOpenChange(false);
    router.push(item.href);
  };
  const handleOpen = (o: boolean) => {
    if (!o) { setQuery(''); setIndex(0); }
    onOpenChange(o);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && results[index]) { e.preventDefault(); go(results[index]); }
  };
  const groupLabel = (id: string) => NAV_GROUPS.find((g) => g.id === id)?.label ?? id;
  return (
    <Dialog.Root open={open} onOpenChange={handleOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="holo-overlay" />
        <Dialog.Content className="holo-modal holo-panel holo-tone-accent p-0" data-glow="soft" style={{ '--holo-modal-w': '36rem' } as React.CSSProperties} onKeyDown={onKey}
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={(event) => { const target = returnFocusTo?.current ?? returnFocus.current; if (target?.isConnected) { event.preventDefault(); target.focus(); } }}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Type to search every screen. Use arrow keys and Enter.</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
            <input
              autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
              role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-activedescendant={results[index] ? `${uid}-${results[index].id}` : undefined}
              aria-label="Search screens" placeholder="Go to a screen..."
              className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground">Esc</kbd>
          </div>
          <ul id={`${uid}-list`} role="listbox" aria-label="Screens" className="max-h-[50vh] overflow-auto p-2">
            {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground" role="presentation">No screen matches that.</li>}
            {results.map((item, n) => {
              const Icon = item.icon;
              return (
                <li key={item.id} id={`${uid}-${item.id}`} role="option" aria-selected={n === index}
                  onMouseMove={() => setIndex(n)} onClick={() => go(item)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm', n === index ? 'bg-primary/10 text-foreground' : 'text-muted-foreground')}>
                  <Icon className={cn('h-4 w-4 shrink-0', n === index && 'text-primary')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">{item.label}</span>
                    <span className="block truncate text-xs">{item.description}</span>
                  </span>
                  {item.status === 'soon' && <span className="font-mono text-[0.625rem] uppercase tracking-widest">Soon</span>}
                  <span className="font-mono text-[0.625rem] uppercase tracking-widest">{groupLabel(item.group)}</span>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
