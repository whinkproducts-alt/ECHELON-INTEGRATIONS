'use client';
// The Kernel: four luminous layers (one per word of the product name) around the persona portrait, with an
// architecture strip beneath. Pure SVG + CSS transforms. Facts come only from real endpoints; anything the
// server does not report reads "not reported". Hover or focus a layer to expand it.
import * as React from 'react';
import { HoloBadge, HoloHeading, HoloPanel } from '@/components/ui/holo';
import { toneClass, type HoloTone } from '@/components/ui/holo';
import { ACRONYM_LINES } from '@/components/shell/boot-sequence';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { cn } from '@/lib/utils';
import { asArray, asRecord, fmtInt, useApi, type ApiState } from './use-api';

interface Fact { label: string; value: string | null }
interface Layer {
  id: 'world' | 'human' | 'neural' | 'kernel';
  radius: number;
  tone: HoloTone;
  seconds: number;
  reverse: boolean;
  dash: string;
  nodes: number;
  /** Where the ring's label sits, in degrees (0 = right, 90 = down). Each ring gets its own angle. */
  labelAngle: number;
  facts: Fact[];
}

const POINT = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: (r * Math.cos(a)).toFixed(2), y: (r * Math.sin(a)).toFixed(2) };
};

function countOf(s: ApiState<unknown>, pick: (d: unknown) => number | null): string | null {
  return s.state === 'ok' ? (() => { const n = pick(s.data); return n === null ? null : fmtInt(n); })() : null;
}

export function KernelScreen() {
  const tenant = useTenantConfig();
  const connectors = useApi('/api/connectors');
  const contacts = useApi('/api/contacts');
  const memory = useApi('/api/memory?type=semantic&limit=200');
  const approvals = useApi('/api/approvals?status=pending');
  const usage = useApi('/api/usage?range=7d');
  const ledger = useApi('/api/ledger?limit=200');
  const [active, setActive] = React.useState<Layer['id']>('world');

  const connList = connectors.state === 'ok' ? asArray(asRecord(connectors.data).connectors).map(asRecord) : null;
  const connected = connList ? connList.filter((c) => c.status === 'connected') : null;
  const gateway = connList?.find((c) => c.id === 'openclaw');
  const mem = memory.state === 'ok' ? asRecord(memory.data) : null;
  const memN = mem ? asArray(mem.items).length : null;
  const memText = memN === null ? null : (mem?.nextCursor ? `${fmtInt(memN)}+` : fmtInt(memN));
  const u = usage.state === 'ok' ? asRecord(usage.data) : null;
  const models = u ? asArray(u.byModel).map(asRecord) : null;
  const tokens = models ? models.reduce((s, m) => s + Number(m.tokensIn ?? 0) + Number(m.tokensOut ?? 0), 0) : null;
  const budget = u ? asRecord(u.budget) : null;
  const pending = countOf(approvals, (d) => asArray(asRecord(d).approvals).length);
  const ledgerN = countOf(ledger, (d) => asArray(d).length);

  const layers: Layer[] = [
    { id: 'world', radius: 330, tone: 'accent', seconds: 140, reverse: false, dash: '2 14', nodes: 5, labelAngle: -38, facts: [
      { label: 'Connectors connected', value: connected && connList ? `${connected.length} of ${connList.length}` : null },
      { label: 'Contacts on file', value: countOf(contacts, (d) => asArray(asRecord(d).contacts).length) },
    ] },
    { id: 'human', radius: 262, tone: 'deep', seconds: 110, reverse: true, dash: '40 10 4 10', nodes: 4, labelAngle: -142, facts: [
      { label: 'Semantic memories (latest page)', value: memText },
      { label: 'Approvals pending', value: pending },
    ] },
    { id: 'neural', radius: 194, tone: 'accent', seconds: 80, reverse: false, dash: '6 6', nodes: 3, labelAngle: 32, facts: [
      { label: 'Models used, last 7 days', value: models ? fmtInt(models.length) : null },
      { label: 'Tokens, last 7 days', value: tokens === null ? null : fmtInt(tokens) },
    ] },
    { id: 'kernel', radius: 126, tone: 'deep', seconds: 56, reverse: true, dash: '1 0', nodes: 2, labelAngle: 90, facts: [
      { label: 'Ledger entries (latest 200)', value: ledgerN },
      { label: 'Monthly token budget', value: budget && typeof budget.state === 'string' ? (budget.limit === null ? 'unlimited' : `${String(budget.state)}, ${fmtInt(Number(budget.used ?? 0))} of ${fmtInt(Number(budget.limit ?? 0))} used`) : null },
    ] },
  ];

  const strip: Array<{ name: string; blurb: string; status: string | null }> = [
    { name: 'Memory', blurb: 'Durable, deduplicated recall', status: memText === null ? null : `${memText} semantic` },
    { name: 'Model Router', blurb: 'Any model, config only', status: models ? `${models.length} model${models.length === 1 ? '' : 's'} in use` : null },
    { name: 'Tools', blurb: 'Typed, permissioned actions', status: connList ? `${connected?.length ?? 0} connector${connected?.length === 1 ? '' : 's'} live` : null },
    { name: 'Permission Engine', blurb: 'A, B and C classes', status: pending === null ? null : `${pending} awaiting approval` },
    { name: 'Ledger', blurb: 'Every action recorded', status: ledgerN === null ? null : `${ledgerN} recent` },
    { name: 'Gateway', blurb: 'MCP bridge to outside apps', status: gateway ? String(gateway.status).replace('_', ' ') : null },
  ];

  const loading = [connectors, contacts, memory, approvals, usage, ledger].some((s) => s.state === 'loading');
  const word = (id: Layer['id']) => ACRONYM_LINES[['world', 'human', 'neural', 'kernel'].indexOf(id)];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 p-4 sm:p-8">
      <HoloHeading
        eyebrow={tenant.fullName}
        title="The Kernel"
        description={<>{tenant.acronymExpansion}. Four layers around one mind. Hover or focus a layer to see what it is doing right now.</>}
      />

      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="relative mx-auto aspect-square w-full max-w-[640px]">
          <svg viewBox="-400 -400 800 800" className="absolute inset-0 h-full w-full overflow-visible" role="img"
            aria-label={`Diagram: four concentric layers, ${ACRONYM_LINES.map((l) => l.word).join(', ')}, around the ${tenant.productName} core.`}>
            <defs>
              <radialGradient id="kernel-core-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(190)">
                <stop offset="0" stopColor="hsl(var(--whink-accent))" stopOpacity="0.35" />
                <stop offset="1" stopColor="hsl(var(--whink-accent))" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle r="190" fill="url(#kernel-core-glow)" />
            {layers.map((l) => {
              const on = active === l.id;
              return (
                <g key={l.id} className={toneClass(l.tone)} style={{ opacity: on ? 1 : 0.55, transition: 'opacity 300ms' }}>
                  <g style={{ transform: on ? 'scale(1.035)' : 'scale(1)', transition: 'transform 400ms cubic-bezier(.2,.8,.2,1)', transformBox: 'view-box', transformOrigin: 'center' }}>
                    <g
                      className={cn('animate-[holo-spin_linear_infinite] motion-reduce:animate-none', l.reverse && '[animation-direction:reverse]')}
                      style={{ animationDuration: `${l.seconds}s`, transformBox: 'view-box', transformOrigin: 'center' }}
                    >
                      <circle r={l.radius} fill="none" stroke="hsl(var(--holo-c))" strokeOpacity={on ? 0.9 : 0.45} strokeWidth={on ? 2.5 : 1.5} strokeDasharray={l.dash} />
                      <circle r={l.radius + 9} fill="none" stroke="hsl(var(--holo-c))" strokeOpacity="0.18" strokeWidth="1" />
                      {Array.from({ length: l.nodes }, (_, i) => {
                        const p = POINT(l.radius, (360 / l.nodes) * i + 18);
                        return (
                          <g key={i}>
                            <circle cx={p.x} cy={p.y} r="11" fill="hsl(var(--holo-c))" fillOpacity="0.18" />
                            <circle cx={p.x} cy={p.y} r="4.5" fill="hsl(var(--holo-c))" />
                          </g>
                        );
                      })}
                    </g>
                  </g>
                  <circle r={l.radius} fill="none" stroke="transparent" strokeWidth="44" style={{ pointerEvents: 'stroke' }}
                    onPointerEnter={() => setActive(l.id)} onPointerDown={() => setActive(l.id)} />
                  {(() => {
                    const text = word(l.id).word;
                    const w = 34 + text.length * 14;
                    const p = POINT(l.radius, l.labelAngle);
                    return (
                      <g transform={`translate(${p.x} ${p.y})`} aria-hidden>
                        <rect x={-w / 2} y="-17" width={w} height="34" rx="17" fill="hsl(var(--base))" fillOpacity="0.92" stroke="hsl(var(--holo-c))" strokeOpacity={on ? 1 : 0.5} strokeWidth={on ? 2 : 1} />
                        <circle cx={-w / 2 + 14} cy="0" r="3.5" fill="hsl(var(--holo-c))" />
                        <text x="6" textAnchor="middle" dominantBaseline="central" fill="hsl(var(--foreground))" fontSize="17" letterSpacing="2" className="font-mono" style={{ textTransform: 'uppercase' }}>{text}</text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}
          </svg>

          <div className="absolute left-1/2 top-1/2 aspect-square w-[21%] -translate-x-1/2 -translate-y-1/2">
            <div className="h-full w-full animate-[holo-float_7s_ease-in-out_infinite] motion-reduce:animate-none">
              <div className="relative h-full w-full overflow-hidden rounded-full border border-primary/60" style={{ boxShadow: '0 0 60px 6px hsl(var(--whink-accent) / 0.45), inset 0 0 24px hsl(var(--base) / 0.6)' }}>
                <img src="/avatar/whink-persona.webp" alt={`${tenant.productName} portrait`} width={168} height={168} className="h-full w-full object-cover" decoding="async" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3" role="list" aria-label="Layers" aria-busy={loading || undefined}>
          {layers.map((l) => {
            const on = active === l.id;
            const w = word(l.id);
            return (
              <div role="listitem" key={l.id}>
                <HoloPanel tone={l.tone} glow={on ? 'soft' : 'none'} className={cn('transition-opacity', !on && 'opacity-80')}>
                  <button
                    type="button" aria-expanded={on} aria-controls={`layer-${l.id}`}
                    onClick={() => setActive(l.id)} onFocus={() => setActive(l.id)} onPointerEnter={() => setActive(l.id)}
                    className="flex w-full items-baseline gap-3 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  >
                    <span className="font-mono text-2xl text-[hsl(var(--holo-c))]" aria-hidden>{w.letter}</span>
                    <span className="font-display text-lg font-semibold text-foreground">{w.word}</span>
                  </button>
                  <div id={`layer-${l.id}`} hidden={!on} className="mt-3 space-y-3">
                    <p className="text-sm text-muted-foreground">{w.meaning}</p>
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {l.facts.map((f) => (
                        <div key={f.label} className="rounded-md border border-border bg-background/40 p-2">
                          <dt className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">{f.label}</dt>
                          <dd className={cn('mt-1 font-mono text-base tabular-nums', f.value === null ? 'text-muted-foreground' : 'text-foreground')}>
                            {f.value ?? (loading ? 'loading' : 'not reported')}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </HoloPanel>
              </div>
            );
          })}
        </div>
      </div>

      <section aria-label="Architecture">
        <h2 className="mb-3 font-mono text-[0.6875rem] uppercase tracking-[0.28em] text-muted-foreground">Architecture</h2>
        <ol className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {strip.map((s, i) => (
            <li key={s.name} className="list-none">
              <HoloPanel className="h-full !p-4">
                <p className="font-mono text-[0.625rem] text-muted-foreground">{String(i + 1).padStart(2, '0')}</p>
                <h3 className="font-display text-base font-semibold text-foreground">{s.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{s.blurb}</p>
                <div className="mt-3">
                  {s.status ? <HoloBadge tone="accent" dot>{s.status}</HoloBadge> : <HoloBadge tone="neutral">{loading ? 'loading' : 'not reported'}</HoloBadge>}
                </div>
              </HoloPanel>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default KernelScreen;
