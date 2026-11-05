'use client';

import { motion } from 'framer-motion';
import { PERSONAS, type PersonaType } from '@/lib/personas';

/**
 * Board hierarchy as a dense table. Rows, not marketing cards.
 * Each row carries a small full-body silhouette, reporting line, and the
 * persona's declared capabilities. Selecting a row opens the conversation.
 */

type Group = { label: string; note: string; members: PersonaType[] };

const GROUPS: Group[] = [
  {
    label: 'Board',
    note: 'Equal authority · report to the Founder',
    members: ['WHINK', 'MAMBA', 'AMARA'],
  },
  {
    label: 'Innovation Committee',
    note: 'Report to AMARA',
    members: ['MATEO', 'PRIYA', 'SOREN', 'MEI_LING'],
  },
  {
    label: 'Self-improvement',
    note: 'Reports to WHINK · every 6h',
    members: ['MAYA'],
  },
];

export function PremiumBoard({
  activePersona,
  onSelect,
}: {
  activePersona: PersonaType;
  onSelect: (p: PersonaType) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-6 sm:px-8">
      <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">Board</h1>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {GROUPS.reduce((n, g) => n + g.members.length, 0)} agents · equal authority where declared · select a row to open its conversation
      </p>

      <div className="mt-8 space-y-10">
        {GROUPS.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{group.label}</h2>
              <p className="font-mono text-[11px] text-muted-foreground/80">{group.note}</p>
            </div>
            <ul className="divide-y divide-border/60">
              {group.members.map((p) => {
                const c = PERSONAS[p];
                const active = p === activePersona;
                return (
                  <li key={p}>
                    <motion.button
                      type="button"
                      onClick={() => onSelect(p)}
                      whileHover={{ backgroundColor: 'hsl(var(--secondary) / 0.4)' }}
                      className="flex w-full items-start gap-4 py-4 text-left"
                    >
                      <Silhouette persona={p} gradient={c.gradient} accent={c.accent} active={active} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <span className="text-sm font-medium text-foreground">{c.name}</span>
                          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                            {c.title}
                          </span>
                          {active && (
                            <span className="rounded-sm border border-border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--whink-accent))]">
                              active
                            </span>
                          )}
                        </div>
                        <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{c.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.capabilities.slice(0, 4).map((cap) => (
                            <span
                              key={cap}
                              className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="mt-1 hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                        {c.reportsTo === 'FOUNDER' ? '→ founder' : `→ ${PERSONAS[c.reportsTo]?.name ?? c.reportsTo}`}
                      </span>
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Silhouette({
  persona,
  gradient,
  accent,
  active,
}: {
  persona: PersonaType;
  gradient: string;
  accent: string;
  active: boolean;
}) {
  const uid = `sb-${persona}`;
  return (
    <svg
      viewBox="0 0 60 90"
      className="mt-0.5 h-[54px] w-9 shrink-0"
      role="img"
      aria-label={`${PERSONAS[persona].name} mark`}
    >
      <defs>
        <linearGradient id={uid} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: gradient.split(',')[0].split('(')[1] }} />
          <stop offset="100%" style={{ stopColor: gradient.split(',')[2].split(')')[0] }} />
        </linearGradient>
      </defs>
      <path
        d="M30 4 C44 4 53 15 53 28 C53 48 44 72 30 86 C16 72 7 48 7 28 C7 15 16 4 30 4 Z"
        fill={`url(#${uid})`}
        opacity={active ? 1 : 0.88}
        stroke={accent}
        strokeWidth="0.8"
      />
      <g fill="#0B0B0C" opacity="0.55">
        <ellipse cx="23" cy="28" rx="2.6" ry="3.6" />
        <ellipse cx="37" cy="28" rx="2.6" ry="3.6" />
      </g>
      <path d="M24 44 Q30 47 36 44" stroke={accent} strokeWidth="0.9" fill="none" opacity="0.65" />
    </svg>
  );
}