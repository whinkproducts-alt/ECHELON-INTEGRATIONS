'use client';
// Change requests: composer plus list. GET/POST /api/change-requests. Saving a draft sends nothing anywhere.
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GitPullRequestDraft } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { fmtDate } from '@/components/screens/subsidiaries/format';
import { useJson } from '@/components/screens/subsidiaries/use-json';
import { FlowPanel } from './flow-panel';
import { BODY_MAX, TITLE_MAX, readError, statusLabel, statusTone, type ChangeRequest } from './types';

const field = 'w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
const label = 'mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground';

function Composer() {
  const router = useRouter();
  const uid = React.useId();
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const valid = title.trim().length > 0 && title.trim().length <= TITLE_MAX && body.trim().length > 0 && body.length <= BODY_MAX;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    fetch('/api/change-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), body: body.trim() }) })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `Could not save (${res.status})`));
        const d = (await res.json()) as { changeRequest?: ChangeRequest };
        if (!d.changeRequest) throw new Error('The server did not return the request');
        router.push(`/dashboard/change-requests/${encodeURIComponent(d.changeRequest.id)}`);
      })
      .catch((err: unknown) => { setError(err instanceof Error ? err.message : 'Could not save'); setBusy(false); });
  };

  return (
    <HoloPanel as="section" aria-labelledby={`${uid}-h`}>
      <form onSubmit={save} className="space-y-4" noValidate>
        <h2 id={`${uid}-h`} className="font-display text-xl font-semibold text-foreground">Write a change request</h2>
        <div>
          <label htmlFor={`${uid}-t`} className={label}>Title</label>
          <input id={`${uid}-t`} className={field} value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder="What should change, in one line" />
        </div>
        <div>
          <label htmlFor={`${uid}-b`} className={label}>Description</label>
          <textarea id={`${uid}-b`} className={field} rows={6} value={body} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} aria-describedby={`${uid}-c`}
            placeholder="Describe the change, why it matters and how you will know it works. Do not paste passwords or keys." />
          <p id={`${uid}-c`} className="mt-1 text-right font-mono text-[0.6875rem] text-muted-foreground">{body.length}/{BODY_MAX}</p>
        </div>
        {error && <p className="text-sm text-foreground" role="alert"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-widest text-[hsl(var(--ember))]">Not saved</span>{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Saving a draft sends nothing anywhere.</p>
          <HoloButton type="submit" loading={busy} disabled={!valid}>Save draft</HoloButton>
        </div>
      </form>
    </HoloPanel>
  );
}

export function ChangeRequestsScreen() {
  const { result, retry } = useJson<{ changeRequests: ChangeRequest[] }>('/api/change-requests');
  let list: React.ReactNode;
  if (result.state === 'loading') {
    list = (
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading change requests</span>
        <div className="grid gap-3" aria-hidden>{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-secondary/50 motion-reduce:animate-none" />)}</div>
      </div>
    );
  } else if (result.state !== 'ok') {
    list = <HoloEmpty state="error" title="Change requests could not be loaded" description="The server did not answer. Nothing was changed." action={<HoloButton onClick={retry}>Retry</HoloButton>} />;
  } else if (result.data.changeRequests.length === 0) {
    list = <HoloEmpty icon={<GitPullRequestDraft className="h-6 w-6" aria-hidden />} title="No change requests yet" description="Write the first one above. It stays a private draft until you approve sending it." />;
  } else {
    list = (
      <ul className="grid gap-3">
        {result.data.changeRequests.map((c) => (
          <li key={c.id}>
            <HoloPanel as="article" aria-label={c.title} className="!p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/dashboard/change-requests/${encodeURIComponent(c.id)}`} className="break-words font-display text-base font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{c.title}</Link>
                  <p className="font-mono text-xs text-muted-foreground">Updated {fmtDate(c.updatedAt)}</p>
                </div>
                <HoloBadge tone={statusTone(c.status)} dot>{statusLabel(c.status)}</HoloBadge>
              </div>
            </HoloPanel>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={40} floor={false} />
      <div className="relative z-10 mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-8">
        <HoloHeading eyebrow="Build" title="Change requests" description="Ask for a change to the product. You approve what leaves your account." />
        <FlowPanel />
        <Composer />
        <section aria-labelledby="cr-list" className="space-y-3">
          <h2 id="cr-list" className="font-display text-xl font-semibold text-foreground">Your requests</h2>
          {list}
        </section>
      </div>
    </div>
  );
}
