'use client';
// Kill Team roster: add, delete, and talk to members one by one or all together. Founder only (the API enforces it).
import { Skeleton } from '@/components/ui/skeleton';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, MessageSquare, Plus, Trash2, Users } from 'lucide-react';

interface Member { slug: string; name: string; role: string; handoff: string }
interface Reply { slug: string; name: string; reply?: string; error?: string }

export function KillTeamRoster({ founder }: { founder: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', role: '', brief: '' });
  const [target, setTarget] = useState<string>('all');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [replies, setReplies] = useState<Reply[]>([]);

  const load = useCallback(async () => {
    const r = await fetch('/api/kill-team/members');
    if (!r.ok) { setError(r.status === 403 ? 'Founder access required.' : 'The roster did not load.'); return; }
    setMembers(((await r.json()) as { members: Member[] }).members);
  }, []);
  useEffect(() => {
    if (!founder) return;
    let live = true;
    fetch('/api/kill-team/members')
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return (await r.json()) as { members: Member[] }; })
      .then((d) => { if (live) setMembers(d.members); })
      .catch(() => { if (live) setError('The roster did not load.'); });
    return () => { live = false; };
  }, [founder]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await fetch('/api/kill-team/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    if (!r.ok) { setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Could not add the member.'); return; }
    setDraft({ name: '', role: '', brief: '' });
    setAdding(false);
    await load();
  };

  const remove = async (m: Member) => {
    if (!window.confirm(`Remove ${m.name} from the Kill Team?`)) return;
    const r = await fetch(`/api/kill-team/members/${encodeURIComponent(m.slug)}`, { method: 'DELETE' });
    if (!r.ok) { setError('Could not remove that member.'); return; }
    if (target === m.slug) setTarget('all');
    await load();
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true); setError(null); setReplies([]);
    try {
      const r = await fetch('/api/kill-team/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target, message }) });
      const d = (await r.json().catch(() => ({}))) as { replies?: Reply[]; error?: string };
      if (!r.ok) setError(d.error ?? 'The team did not answer.'); else setReplies(d.replies ?? []);
    } catch { setError('The team did not answer.'); } finally { setBusy(false); }
  };

  const input = 'min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground disabled:opacity-50';
  return (
    <>
      <section aria-labelledby="specialists-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="specialists-heading" className="text-sm font-semibold text-foreground">Specialists</h2>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">{members?.length ?? 0} active roles</span>
            {founder && <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-3 text-xs text-foreground"><Plus className="h-3.5 w-3.5" aria-hidden />Add member</button>}
          </div>
        </div>
        {adding && (
          <form onSubmit={add} className="mb-3 grid gap-2 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
            <input aria-label="Name" required maxLength={60} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={input} />
            <input aria-label="Role" required maxLength={120} placeholder="Role, for example Legal review" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className={input} />
            <textarea aria-label="Brief" maxLength={1500} rows={3} placeholder="Optional brief: how this member should think and what to focus on" value={draft.brief} onChange={(e) => setDraft({ ...draft, brief: e.target.value })} className={`${input} py-2 md:col-span-2`} />
            <button type="submit" className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground md:col-span-2">Add to the Kill Team</button>
          </form>
        )}
        {founder && members === null && !error && <div role="status" aria-busy="true"><span className="sr-only">Loading the roster</span><Skeleton className="h-16 w-full" /></div>}
        {(!founder || (members && members.length === 0)) && <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{founder ? 'The Kill Team is empty. Add a member.' : 'The roster is visible to the founder only.'}</p>}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {members?.map((m) => (
            <article key={m.slug} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-display font-semibold text-foreground">{m.name}</h3><p className="mt-1 text-xs text-muted-foreground">{m.role}</p></div>
                <span className="rounded bg-secondary px-2 py-1 font-mono text-[0.625rem] uppercase text-muted-foreground">{m.slug}</span>
              </div>
              {m.handoff && <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><ArrowRight className="h-3.5 w-3.5 text-primary" aria-hidden /> {m.handoff}</div>}
              {founder && (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setTarget(m.slug)} aria-pressed={target === m.slug} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-foreground aria-pressed:border-primary"><MessageSquare className="h-3.5 w-3.5" aria-hidden />Talk</button>
                  <button type="button" onClick={() => void remove(m)} aria-label={`Remove ${m.name}`} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"><Trash2 className="h-3.5 w-3.5" aria-hidden />Remove</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {founder && members && members.length > 0 && (
        <section aria-labelledby="kt-chat-heading" className="rounded-xl border border-border bg-card p-5">
          <h2 id="kt-chat-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground"><Users className="h-4 w-4 text-primary" aria-hidden />Talk to the team</h2>
          <p className="mt-1 text-xs text-muted-foreground">Answers are advice only. This chat cannot run tools, send anything or spend money, and nothing here is stored.</p>
          <form onSubmit={send} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select aria-label="Who to talk to" value={target} onChange={(e) => setTarget(e.target.value)} className={input}>
              <option value="all">Everyone</option>
              {members.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
            </select>
            <input aria-label="Message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Ask a question or give the team a problem" className={`${input} min-w-0 flex-1`} />
            <button type="submit" disabled={busy || !message.trim()} className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? 'Waiting…' : 'Send'}</button>
          </form>
          <div aria-live="polite" className="mt-3 space-y-2">
            {replies.map((r) => (
              <div key={r.slug} className="rounded-md bg-secondary/60 px-3 py-2 text-sm">
                <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{r.name}</p>
                <p className="mt-1 whitespace-pre-wrap text-foreground">{r.reply ?? r.error}</p>
              </div>
            ))}
          </div>
        </section>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>
  );
}
