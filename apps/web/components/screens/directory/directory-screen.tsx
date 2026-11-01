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
.dir-grow-y { transform-origin: top; transform: scaleY(0); animation: dir-y 0.7s cubic-bezier(0.2,0.7,0.2,1) 0.15s forwards; }
.dir-grow-x { transform-origin: center; transform: scaleX(0); animation: dir-x 0.8s cubic-bezier(0.2,0.7,0.2,1) 0.5s forwards; }
.dir-drop { transform-origin: top; transform: scaleY(0); animation: dir-y 0.6s cubic-bezier(0.2,0.7,0.2,1) 1s forwards; }
@keyframes dir-y { to { transform: scaleY(1); } }
@keyframes dir-x { to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) { .dir-grow-y, .dir-grow-x, .dir-drop { animation: none; transform: none; } }
`;
const LINE = 'bg-[hsl(var(--whink-accent)/0.75)] shadow-[0_0_8px_hsl(var(--whink-accent)/0.6)]';

function Card({ s, depth = 0, onOpen }: { s: StaffMember; depth?: number; onOpen: (s: StaffMember) => void }) {
  const st = STATUS[s.status];
  return (
    <HoloPanel as="div" interactive tone={s.kind === 'agent' ? 'deep' : 'accent'} glow={depth === 0 && s.reportsTo === null ? 'strong' : 'none'}
      data-dir-card className="w-full text-left" role="button" aria-label={`${s.firstName} ${s.lastName}, ${s.role}. Open details`}
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
              <div className="relative hidden h-14 w-full lg:block" aria-hidden>
                <span className={cn('dir-grow-y absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2', LINE)} />
                {branches.length > 1 && <span className={cn('dir-grow-x absolute top-1/2 h-px', LINE)} style={{ left: `${xs[0]}%`, width: `${xs[xs.length - 1] - xs[0]}%` }} />}
                {xs.map((x, i) => (
                  <span key={branches[i]} className={cn('dir-drop absolute top-1/2 bottom-0 w-px -translate-x-1/2', LINE)} style={{ left: `${x}%` }}>
                    <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[hsl(var(--whink-accent))] shadow-[0_0_10px_hsl(var(--whink-accent))]" />
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))] lg:mt-0 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ '--n': n } as React.CSSProperties}>
              {branches.map((d) => {
                const people = visible.filter((s) => s.directorate === d && s.id !== root?.id);
                const ids = new Set(people.map((p) => p.id));
                const top = people.filter((p) => !p.reportsTo || !ids.has(p.reportsTo));
                const ordered = top.flatMap((t) => [{ s: t, depth: 0 }, ...people.filter((p) => p.reportsTo === t.id).map((s) => ({ s, depth: 1 }))]);
                return (
                  <section key={d} aria-label={d} className="space-y-3">
                    <h2 className="mx-auto w-fit max-w-full rounded-full border border-[hsl(var(--whink-accent)/0.4)] bg-[hsl(var(--whink-accent)/0.08)] px-4 py-1 text-center font-mono text-[0.6875rem] uppercase tracking-[0.22em] shadow-[0_0_24px_-6px_hsl(var(--whink-accent)/0.6)]" style={{ color: 'hsl(var(--whink-accent))' }}>{d} <span className="text-muted-foreground">{people.length}</span></h2>
                    {ordered.map(({ s, depth }) => depth === 0
                      ? <Card key={s.id} s={s} depth={0} onOpen={setOpen} />
                      : (
                        <div key={s.id} className="relative ml-6">
                          <span aria-hidden className="absolute -left-4 -top-3 h-[calc(50%+0.75rem)] w-4 rounded-bl-xl border-b border-l border-[hsl(var(--whink-accent)/0.45)]" />
                          <Card s={s} depth={1} onOpen={setOpen} />
                        </div>
                      ))}
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
