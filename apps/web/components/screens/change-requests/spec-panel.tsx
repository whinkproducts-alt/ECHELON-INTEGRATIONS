import * as React from 'react';
import { TriangleAlert } from 'lucide-react';
import { HoloBadge, HoloPanel } from '@/components/ui/holo';
import type { CrSpec } from './types';

function List({ title, items, mono = false }: { title: string; items: string[]; mono?: boolean }) {
  return (
    <div>
      <h3 className="mb-1 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">None listed.</p> : (
        <ul className={`list-disc space-y-1 pl-5 text-sm text-foreground ${mono ? 'font-mono text-xs' : ''}`}>
          {items.map((t, i) => <li key={i} className="break-words">{t}</li>)}
        </ul>
      )}
    </div>
  );
}

/** The spec WHINK wrote. Text comes from a model reading your words: shown as plain text only. */
export function SpecPanel({ spec }: { spec: CrSpec }) {
  return (
    <HoloPanel as="section" aria-label="Refined spec" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold text-foreground">Refined spec</h2>
        {spec.touchesSecurityOrMoney && (
          <HoloBadge tone="ember"><TriangleAlert className="h-3 w-3" aria-hidden />Touches security or money</HoloBadge>
        )}
      </div>
      {spec.touchesSecurityOrMoney && (
        <p className="text-xs text-foreground" role="note">WHINK flagged this change as touching security or money. Read the risks before you approve.</p>
      )}
      <div>
        <h3 className="mb-1 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">Summary</h3>
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{spec.summary}</p>
      </div>
      <List title="Acceptance criteria" items={spec.acceptanceCriteria} />
      <List title="Files likely touched" items={spec.filesLikelyTouched} mono />
      <List title="Risks" items={spec.risks} />
    </HoloPanel>
  );
}
