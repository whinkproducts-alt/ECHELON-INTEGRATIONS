'use client';

import { useState } from 'react';

interface P { key: string; name: string; role: string; tier: number; lessons: number }
type Msg = { role: 'you' | 'them'; text: string };

export function People({ people }: { people: P[] }) {
  const [sel, setSel] = useState<P | null>(null);
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const shown = people.filter((p) => `${p.name} ${p.role}`.toLowerCase().includes(q.toLowerCase()));
  const thread = sel ? threads[sel.key] ?? [] : [];

  async function send() {
    if (!sel || !text.trim() || busy) return;
    const key = sel.key; const message = text.trim();
    setText(''); setBusy(true);
    setThreads((t) => ({ ...t, [key]: [...(t[key] ?? []), { role: 'you', text: message }] }));
    const r = await fetch('/api/org/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, message }) });
    const j = await r.json().catch(() => ({}));
    setThreads((t) => ({ ...t, [key]: [...(t[key] ?? []), { role: 'them', text: r.ok ? j.reply : (j.error ?? 'No reply.') }] }));
    setBusy(false);
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-6 md:grid-cols-[18rem_1fr]">
      <aside className="space-y-2">
        <input className="w-full rounded border border-border bg-background px-2 py-1 text-sm" placeholder="Find someone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find someone" />
        <ul className="max-h-[70vh] overflow-auto text-sm">
          {shown.map((p) => (
            <li key={p.key}><button className={`w-full rounded px-2 py-1 text-left hover:bg-secondary ${sel?.key === p.key ? 'bg-secondary' : ''}`} onClick={() => setSel(p)}>
              <div>{p.name}</div><div className="text-xs text-muted-foreground">{p.role}</div></button></li>
          ))}
        </ul>
      </aside>
      <section className="rounded-xl border border-border bg-card p-4">
        {!sel ? <p className="text-sm text-muted-foreground">Pick someone to talk to. Each keeps their own thread. They cannot act, spend or send from here.</p> : (
          <div className="space-y-3">
            <h2 className="font-medium">{sel.name} <span className="text-xs text-muted-foreground">{sel.role} · {sel.lessons} saved lessons</span></h2>
            <div className="min-h-40 space-y-2 text-sm" aria-live="polite">
              {thread.map((m, i) => <p key={i} className={m.role === 'you' ? 'text-muted-foreground' : ''}><strong>{m.role === 'you' ? 'You' : sel.name}:</strong> {m.text}</p>)}
              {busy && <p className="text-muted-foreground">…</p>}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
              <input className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label={`Message ${sel.name}`} maxLength={2000} />
              <button className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50" disabled={busy}>Send</button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
