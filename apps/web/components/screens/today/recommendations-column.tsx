'use client';
// Recommendations from the standing roster (GET /api/recommendations). All text is untrusted and rendered as text.
// Severity never uses amber (approvals and limits only) or denial red (security events only).
import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloPanel } from '@/components/ui/holo';
import type { HoloTone } from '@/components/ui/holo/tone';

interface Rec { id: string; source: string; title: string; body: string; link: string | null; severity: string }
type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; items: Rec[] };

const SEVERITY: Record<string, { tone: HoloTone; label: string }> = {
  info: { tone: 'neutral', label: 'Info' },
  warning: { tone: 'accent', label: 'Heads up' },
  critical: { tone: 'ember', label: 'Important' },
};

/** Internal dashboard paths only. Anything else (external URLs, protocol-relative, odd characters) is ignored. */
export function internalLink(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!/^\/dashboard(\/[A-Za-z0-9._~\-/%]*)?(\?[A-Za-z0-9._~\-=&%]*)?$/.test(raw)) return null;
  if (raw.includes('//') || raw.includes('..')) return null;
  return raw;
}

function parse(v: unknown): Rec[] {
  const list = typeof v === 'object' && v !== null && Array.isArray((v as { items?: unknown }).items) ? (v as { items: unknown[] }).items : [];
  return list.flatMap((r) => {
    if (typeof r !== 'object' || r === null) return [];
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.title !== 'string') return [];
    return [{ id: o.id, source: typeof o.source === 'string' ? o.source : 'Unknown source', title: o.title, body: typeof o.body === 'string' ? o.body : '', link: internalLink(o.link), severity: typeof o.severity === 'string' ? o.severity : 'info' }];
  });
}

export function RecommendationsColumn() {
  const [load, setLoad] = React.useState<Load>({ state: 'loading' });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    fetch('/api/recommendations')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((data) => { if (live) setLoad({ state: 'ok', items: parse(data) }); })
      .catch(() => { if (live) setLoad({ state: 'error' }); });
    return () => { live = false; };
  }, []);

  const dismiss = async (id: string) => {
    setBusy(id);
    setNotice(null);
    try {
      const r = await fetch(`/api/recommendations/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
      if (r.ok || r.status === 404) {
        setLoad((cur) => (cur.state === 'ok' ? { state: 'ok', items: cur.items.filter((x) => x.id !== id) } : cur));
      } else {
        setNotice('Could not dismiss that one. Try again.');
      }
    } catch {
      setNotice('Could not dismiss that one. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (load.state === 'loading') return <HoloEmpty state="loading" title="Checking for recommendations" />;
  if (load.state === 'error') return <HoloEmpty state="error" title="Recommendations did not load" description="They could not be read right now." />;
  if (load.items.length === 0) {
    return (
      <HoloEmpty
        icon={<Sparkles className="h-6 w-6" aria-hidden />}
        title="Nothing recommended yet"
        description="Recommendations appear here as the assistant learns your work, your people and your priorities. Until then this stays empty rather than guessing."
      />
    );
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {load.items.map((r) => {
          const sev = SEVERITY[r.severity] ?? SEVERITY.info;
          return (
            <li key={r.id} className="list-none">
              <HoloPanel tone={sev.tone} className="!p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <HoloBadge tone={sev.tone}>{sev.label}</HoloBadge>
                  <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-muted-foreground">{r.source}</span>
                </div>
                <h3 className="font-display text-base text-foreground">{r.title}</h3>
                {r.body && <p className="whitespace-pre-line text-sm text-muted-foreground">{r.body}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {r.link
                    ? <Link href={r.link} className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Open<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
                    : <span />}
                  <HoloButton size="sm" variant="ghost" magnetic={false} loading={busy === r.id} onClick={() => void dismiss(r.id)} aria-label={`Dismiss: ${r.title}`}>Dismiss</HoloButton>
                </div>
              </HoloPanel>
            </li>
          );
        })}
      </ul>
      <div aria-live="polite">{notice && <p role="status" className="text-sm text-foreground">Error: {notice}</p>}</div>
    </div>
  );
}
