'use client';
// DirectoryScreen: org chart. Victor (reportsTo null) is the root, directorates are branches, people are cards.
// Data is lib/staff-directory.ts passed from the server page. Connector lines are SVG drawn in with a stroke animation;
// branch x positions are fixed percentages of an equal-column grid, so nothing is measured and nothing differs between server and client.
// Cards are buttons that open a drawer. Arrow keys move between visible cards.
import * as React from 'react';
import { Search } from 'lucide-react';
import { HoloBadge, HoloDrawer, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import type { HoloTone } from '@/components/ui/holo';
import { PersonaAvatar } from '@/components/ui/persona-avatar';
import { cn } from '@/lib/utils';
import type { StaffMember } from '@/lib/staff-directory';

const STATUS: Record<StaffMember['status'], { tone: HoloTone; label: string }> = {
  active: { tone: 'accent', label: 'Active' },
  pending: { tone: 'amber', label: 'Pending' },
  inactive: { tone: 'neutral', label: 'Inactive' },
};

const css = `
.dir-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: dir-draw 1.1s cubic-bezier(0.2,0.7,0.2,1) 0.2s forwards; }
@keyframes dir-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .dir-line { animation: none; stroke-dashoffset: 0; } }
`;

function Card({ s, depth = 0, onOpen }: { s: StaffMember; depth?: number; onOpen: (s: StaffMember) => void }) {
  const st = STATUS[s.status];
  return (
    <HoloPanel as="div" interactive tone={s.kind === 'agent' ? 'deep' : 'accent'} glow={depth === 0 && s.reportsTo === null ? 'strong' : 'none'}
      data-dir-card className={cn('w-full text-left', depth > 0 && 'ml-4 w-[calc(100%-1rem)]')} role="button" aria-label={`${s.firstName} ${s.lastName}, ${s.role}. Open details`}
      onClick={() => onOpen(s)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(s); } }}>
      <div className="flex items-start gap-3">
        <PersonaAvatar name={`${s.firstName} ${s.lastName}`} imageUrl={s.imageUrl} size="lg" role={s.role} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold text-foreground">{s.firstName} {s.lastName}</p>
          <p className="truncate text-xs text-muted-foreground">{s.role}</p>
          <p className="mt-1 break-all font-mono text-[0.6875rem] text-foreground">{s.email}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <HoloBadge tone={s.kind === 'agent' ? 'deep' : 'accent'}>{s.kind === 'agent' ? 'AI agent' : 'Human'}</HoloBadge>
        <HoloBadge tone={st.tone} dot>{st.label}</HoloBadge>
      </div>
    </HoloPanel>
  );
}

export function DirectoryScreen({ staff }: { staff: StaffMember[] }) {
  const [q, setQ] = React.useState('');
  const [dir, setDir] = React.useState<string>('all');
  const [open, setOpen] = React.useState<StaffMember | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);

  const root = staff.find((s) => s.reportsTo === null) ?? null;
  const directorates = React.useMemo(() => [...new Set(staff.map((s) => s.directorate))], [staff]);
  const term = q.trim().toLowerCase();
  const match = (s: StaffMember) =>
    (dir === 'all' || s.directorate === dir) &&
    (!term || `${s.firstName} ${s.lastName} ${s.role} ${s.title} ${s.email} ${s.directorate}`.toLowerCase().includes(term));
  const visible = staff.filter(match);
  const branches = directorates.filter((d) => visible.some((s) => s.directorate === d && s.id !== root?.id));
  const rootShown = !!root && (visible.some((s) => s.id === root.id) || branches.length > 0);
  const managerName = (id: string | null) => { const m = staff.find((s) => s.id === id); return m ? `${m.firstName} ${m.lastName}` : 'Victor'; };

  const onKey = (e: React.KeyboardEvent) => {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'];
    if (!keys.includes(e.key) || !gridRef.current) return;
    const cards = [...gridRef.current.querySelectorAll<HTMLElement>('[data-dir-card]')];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? Math.min(cards.length - 1, i + 1) : Math.max(0, i - 1);
    cards[next]?.focus();
  };

  const n = Math.max(1, branches.length);
  const xs = branches.map((_, i) => ((i + 0.5) / n) * 100);

  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={60} floor={false} />
      <style>{css}</style>
      <div className="relative z-10 mx-auto w-full max-w-7xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Organisation" title="Directory" description={`${staff.length} people across ${directorates.length} directorates. Humans and AI agents, one chart.`} />

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[14rem] flex-1">
            <span className="sr-only">Search people</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role or email"
              className="w-full rounded-md border border-border bg-[hsl(var(--base)/0.6)] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          </label>
          <div role="group" aria-label="Filter by directorate" className="flex flex-wrap gap-2">
            {['all', ...directorates].map((d) => (
              <button key={d} type="button" aria-pressed={dir === d} onClick={() => setDir(d)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-[hsl(var(--whink-accent)/0.12)] aria-pressed:text-foreground">
                {d === 'all' ? 'All directorates' : d}
              </button>
            ))}
          </div>
        </div>

        {staff.length === 0 ? (
          <HoloEmpty title="The directory is empty" description="No staff are configured in lib/staff-directory.ts." />
        ) : visible.length === 0 ? (
          <HoloEmpty title="No one matches" description="Clear the search or choose another directorate." action={<button type="button" className="text-sm text-primary underline" onClick={() => { setQ(''); setDir('all'); }}>Reset filters</button>} />
        ) : (
          <div ref={gridRef} onKeyDown={onKey} className="space-y-0">
            {root && rootShown && (
              <div className="mx-auto w-full max-w-sm"><Card s={root} onOpen={setOpen} /></div>
            )}
            {branches.length > 0 && (
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="hidden h-10 w-full text-primary md:block" aria-hidden>
                <path pathLength={1} className="dir-line" d={`M50 0 V16 M${xs[0]} 16 H${xs[xs.length - 1]}`} fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                {xs.map((x, i) => <path key={branches[i]} pathLength={1} className="dir-line" d={`M${x} 16 V40`} fill="none" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
              </svg>
            )}
            <div className="mt-4 grid gap-6 md:mt-0" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 18rem), 1fr))` }}>
              {branches.map((d) => {
                const people = visible.filter((s) => s.directorate === d && s.id !== root?.id);
                const ids = new Set(people.map((p) => p.id));
                const top = people.filter((p) => !p.reportsTo || !ids.has(p.reportsTo));
                const ordered = top.flatMap((t) => [{ s: t, depth: 0 }, ...people.filter((p) => p.reportsTo === t.id).map((s) => ({ s, depth: 1 }))]);
                return (
                  <section key={d} aria-label={d} className="space-y-3">
                    <h2 className="text-center font-mono text-[0.6875rem] uppercase tracking-[0.22em]" style={{ color: 'hsl(var(--whink-accent))' }}>{d}</h2>
                    {ordered.map(({ s, depth }) => <Card key={s.id} s={s} depth={depth} onOpen={setOpen} />)}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <HoloDrawer open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }} title={open ? `${open.firstName} ${open.lastName}` : 'Details'} description={open?.title}>
        {open && (
          <dl className="space-y-4 text-sm">
            <div className="flex items-center gap-3"><PersonaAvatar name={`${open.firstName} ${open.lastName}`} imageUrl={open.imageUrl} size="lg" />
              <div className="flex flex-wrap gap-1.5"><HoloBadge tone={open.kind === 'agent' ? 'deep' : 'accent'}>{open.kind === 'agent' ? 'AI agent' : 'Human'}</HoloBadge><HoloBadge tone={STATUS[open.status].tone} dot>{STATUS[open.status].label}</HoloBadge></div></div>
            {([['Role', open.role], ['Directorate', open.directorate], ['Reports to', managerName(open.reportsTo)], ['Email', open.email]] as const).map(([k, v]) => (
              <div key={k}><dt className="font-mono text-[0.625rem] uppercase tracking-[0.2em] text-muted-foreground">{k}</dt><dd className="mt-1 break-all text-foreground">{v}</dd></div>
            ))}
            {open.kind === 'agent' && <p className="text-xs text-muted-foreground">This is an AI agent persona with a named role. It does not act without the permission engine.</p>}
          </dl>
        )}
      </HoloDrawer>
    </div>
  );
}
