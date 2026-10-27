'use client';
// BootSequence props: lines?: BootLine[] (default: the four acronym words with meanings), storageKey?: string, force?: boolean (ignore the once-per-session guard), onDone?: ()=>void
// Plays once per browser session (sessionStorage, guarded by try/catch). Skip with the button, Escape, Enter or a click. Reduced motion shows everything at once, no animation.
// The full product name comes from tenant config (fullName), so it always reads with "Ultimate".
import * as React from 'react';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { HoloButton, HoloOrbBackdrop } from '@/components/ui/holo';

export interface BootLine { letter: string; word: string; meaning: string }

export const ACRONYM_LINES: BootLine[] = [
  { letter: 'W', word: 'World-Aware', meaning: 'Understands your projects, people, files, communications and wider context.' },
  { letter: 'H.I', word: 'Human-Integrated', meaning: 'Built around your preferences, authority and memory.' },
  { letter: 'N', word: 'Neural', meaning: 'The intelligence layer routing across multiple AI models.' },
  { letter: 'K', word: 'Kernel', meaning: 'The core layer coordinating memory, models, tools, permissions, automation and execution.' },
];

const STEP_MS = 1100;
const noopSubscribe = () => () => {};

function readSeen(key: string): boolean {
  try { return window.sessionStorage.getItem(key) === '1'; } catch { return false; }
}
function writeSeen(key: string) {
  try { window.sessionStorage.setItem(key, '1'); } catch { /* storage unavailable: play again next time */ }
}
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function BootSequence({ lines = ACRONYM_LINES, storageKey = 'boot-sequence-seen', force = false, onDone }: { lines?: BootLine[]; storageKey?: string; force?: boolean; onDone?: () => void }) {
  const { fullName, tagline } = useTenantConfig();
  const seen = React.useSyncExternalStore(noopSubscribe, () => readSeen(storageKey), () => false);
  const reduced = React.useSyncExternalStore(subscribeReduced, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);
  const [closed, setClosed] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const visible = !closed && (force || !seen);
  const shown = reduced ? lines.length + 1 : step;

  const finish = React.useCallback(() => {
    writeSeen(storageKey);
    setClosed(true);
    onDone?.();
  }, [storageKey, onDone]);

  React.useEffect(() => {
    if (!visible || reduced) return;
    const id = setInterval(() => setStep((s) => Math.min(lines.length + 1, s + 1)), STEP_MS);
    return () => clearInterval(id);
  }, [visible, reduced, lines.length]);

  React.useEffect(() => {
    if (!visible || reduced || step < lines.length + 1) return;
    const id = setTimeout(finish, 1800);
    return () => clearTimeout(id);
  }, [visible, reduced, step, lines.length, finish]);

  React.useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, finish]);

  if (!visible) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${fullName} starting`} className="fixed inset-0 z-[80] flex flex-col items-center justify-center overflow-hidden bg-background px-6" onClick={finish}>
      <HoloOrbBackdrop stars={90} />
      <div className="relative z-10 w-full max-w-2xl space-y-5" aria-live="polite">
        {lines.map((l, i) => i < shown && (
          <div key={l.word} className="holo-reveal flex items-start gap-5">
            <span className="holo-text-glow w-16 shrink-0 text-right font-display text-4xl font-semibold tracking-tight text-primary sm:w-20 sm:text-5xl">{l.letter}</span>
            <span className="min-w-0 border-l border-border pl-5">
              <span className="block font-display text-xl font-medium tracking-wide text-foreground">{l.word}</span>
              <span className="block text-sm text-muted-foreground">{l.meaning}</span>
            </span>
          </div>
        ))}
        {shown > lines.length && (
          <div className="holo-reveal pt-6 text-center">
            <p className="holo-text-glow font-display text-3xl font-semibold tracking-[0.12em] text-foreground sm:text-4xl">{fullName}</p>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">{tagline}</p>
          </div>
        )}
      </div>
      <div className="relative z-10 mt-10">
        <HoloButton variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); finish(); }}>Skip</HoloButton>
      </div>
    </div>
  );
}
