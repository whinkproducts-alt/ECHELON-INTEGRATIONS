'use client';
// Skill Library. Uploads go to POST /api/skills (field "file"); the list polls GET /api/skills every 5 seconds while any
// submission is still moving through the pipeline. There is no approval step: skills become untrusted reference memory only.
import * as React from 'react';
import { BookOpenCheck, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloModal, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import limits from '@/config/skill-pipeline.json';
import { usePolledJson } from '@/components/screens/swarm/use-polled-json';
import { DropZone, preCheck } from './drop-zone';
import { SubmissionCard } from './submission-card';
import { isActive, type SkillListItem, type SkillListResponse } from './types';

type Outcome = 'uploading' | 'accepted' | 'duplicate' | 'rejected';
interface UploadRow { key: number; filename: string; outcome: Outcome; reason?: string }

const OUTCOME_TEXT: Record<Outcome, string> = {
  uploading: 'Uploading', accepted: 'Accepted for processing', duplicate: 'Duplicate, already in your library', rejected: 'Rejected',
};

interface PostBody { submissions?: Array<{ filename: string; duplicate: boolean }>; rejected?: Array<{ filename: string; error: string }>; error?: string }

function Loading() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading your skill library</span>
      {[0, 1].map((i) => <HoloPanel key={i} tone="deep" edge={false} className="h-40 animate-pulse" aria-hidden><div className="h-full rounded bg-secondary" /></HoloPanel>)}
    </div>
  );
}

export function SkillsScreen() {
  const list = usePolledJson<SkillListResponse>('/api/skills', { intervalMs: 5000, shouldPoll: (d) => d.submissions.some((s) => isActive(s.status)) });
  const [rows, setRows] = React.useState<UploadRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [target, setTarget] = React.useState<SkillListItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const counter = React.useRef(0);
  const { reload } = list;

  const upload = React.useCallback((files: File[]) => {
    const next: UploadRow[] = [];
    const valid: Array<{ file: File; key: number }> = [];
    for (const file of files) {
      const key = ++counter.current;
      const check = preCheck(file);
      if (!check.ok) next.push({ key, filename: file.name, outcome: 'rejected', reason: check.error });
      else { valid.push({ file, key }); next.push({ key, filename: file.name, outcome: 'uploading' }); }
    }
    setRows((prev) => [...next, ...prev].slice(0, 40));
    if (valid.length === 0) return;
    setBusy(true);
    const batches: Array<typeof valid> = [];
    for (let i = 0; i < valid.length; i += limits.maxFilesPerRequest) batches.push(valid.slice(i, i + limits.maxFilesPerRequest));
    const patch = (key: number, outcome: Outcome, reason?: string) =>
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, outcome, reason } : r)));
    let chain: Promise<void> = Promise.resolve();
    for (const batch of batches) {
      chain = chain.then(async () => {
        const form = new FormData();
        for (const b of batch) form.append('file', b.file, b.file.name);
        try {
          const res = await fetch('/api/skills', { method: 'POST', body: form });
          let body: PostBody = {};
          try { body = (await res.json()) as PostBody; } catch { body = {}; }
          const accepted = body.submissions ?? [];
          const rejected = body.rejected ?? [];
          for (const b of batch) {
            // The server sanitises names, so match on the final path segment.
            const base = b.file.name.split(/[\\/]/).pop() ?? b.file.name;
            const acc = accepted.find((a) => a.filename === base.trim().slice(0, 200));
            const rej = rejected.find((r) => r.filename === base.trim().slice(0, 200));
            if (acc) patch(b.key, acc.duplicate ? 'duplicate' : 'accepted');
            else if (rej) patch(b.key, 'rejected', rej.error);
            else patch(b.key, 'rejected', body.error ?? (res.status === 401 ? 'Sign in again to upload' : `Upload failed (${res.status})`));
          }
        } catch {
          for (const b of batch) patch(b.key, 'rejected', 'Network error. Nothing was uploaded.');
        }
      });
    }
    chain.then(() => { setBusy(false); reload(); });
  }, [reload]);

  const confirmDelete = () => {
    if (!target) return;
    setDeleting(true);
    fetch(`/api/skills/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      .then((r) => {
        if (r.ok) toast.success('Skill and its memory entries removed');
        else toast.error(r.status === 404 ? 'That skill no longer exists' : 'Delete failed. Nothing was removed.');
        setTarget(null);
        reload();
      })
      .catch(() => toast.error('Network error. Nothing was removed.'))
      .then(() => setDeleting(false));
  };

  const subs = list.data?.submissions ?? [];
  const active = subs.filter((s) => isActive(s.status)).length;

  const listBody = (() => {
    if (list.loading) return <Loading />;
    if (list.status === 401) return <HoloEmpty state="error" title="Sign in to see your skills" action={<HoloButton href="/login" size="sm">Sign in</HoloButton>} />;
    if (list.status !== 200 || !list.data) {
      return <HoloEmpty state="error" title="The skill library did not load" description="The server did not return your submissions. Nothing has changed." action={<HoloButton size="sm" onClick={reload}>Try again</HoloButton>} />;
    }
    if (subs.length === 0) {
      return <HoloEmpty icon={<BookOpenCheck className="h-6 w-6" aria-hidden />} title="No skills yet" description="Drop a file above. It is scanned, assessed and, only if valuable, added to memory as untrusted reference." />;
    }
    return (
      <ul className="space-y-4" aria-label="Skill submissions">
        {subs.map((s) => <li key={s.id}><SubmissionCard item={s} onDelete={setTarget} /></li>)}
      </ul>
    );
  })();

  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={40} />
      <div className="relative mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Intelligence" title="Skill Library"
          description="Teach the system new reference knowledge. Drop skill files and watch each one move through the pipeline."
          actions={<HoloButton variant="ghost" size="sm" leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={reload} loading={list.loading}>Refresh</HoloButton>} />

        <HoloPanel tone="accent" aria-label="How skills are handled">
          <p className="text-sm text-foreground">
            Skills are scanned by the cyber security agent, assessed by three directors, and only valuable ones are added to memory as untrusted reference. They can never change permissions or add tools.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">There is no approval step: the pipeline runs by itself. Deleting a skill also removes the memory it created.</p>
        </HoloPanel>

        <DropZone busy={busy} onFiles={upload} />

        {rows.length > 0 && (
          <section aria-label="Upload results" className="space-y-2">
            <HoloHeading level={3} title="This upload" tone="deep" />
            <ul className="space-y-2" aria-live="polite">
              {rows.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/60 px-3 py-2">
                  <span className="min-w-0 flex-1 break-all text-sm text-foreground">{r.filename}</span>
                  <HoloBadge tone={r.outcome === 'rejected' ? 'ember' : r.outcome === 'uploading' ? 'neutral' : 'accent'} dot pulse={r.outcome === 'uploading'}>{OUTCOME_TEXT[r.outcome]}</HoloBadge>
                  {r.reason && <span className="w-full break-words text-xs text-muted-foreground">{r.reason}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Submissions" className="space-y-4">
          <HoloHeading level={2} eyebrow="Pipeline" title="Your skills" tone="deep"
            actions={active > 0 ? <HoloBadge tone="accent" dot pulse>{active} in progress, updating every 5 seconds</HoloBadge> : undefined} />
          {list.stale && <p role="status" className="text-xs text-muted-foreground">Live updates are paused after a failed refresh. Showing the last known state.</p>}
          {listBody}
        </section>
      </div>

      <HoloModal open={target !== null} onOpenChange={(o) => { if (!o && !deleting) setTarget(null); }} title="Delete this skill?"
        description={target ? `${target.name} will be removed from your library. This also removes the memory entries it created, so the assistant stops using it.` : undefined}
        footer={<>
          <HoloButton variant="ghost" size="sm" onClick={() => setTarget(null)} disabled={deleting}>Keep it</HoloButton>
          <HoloButton variant="danger" size="sm" loading={deleting} onClick={confirmDelete}>Delete skill and memory</HoloButton>
        </>}>
        <p className="text-sm text-muted-foreground">The deletion is written to the ledger.</p>
      </HoloModal>
    </div>
  );
}
