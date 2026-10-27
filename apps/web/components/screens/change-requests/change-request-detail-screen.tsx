'use client';
// Change request detail. Props: { id: string }.
// GET/PATCH /api/change-requests/[id], POST .../refine, .../submit, .../status, GET .../export.
// Submit is a PROTECTED action (proprietary): it only creates an approval request. Nothing leaves until it is approved.
import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, ExternalLink, Pencil } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { normalizeApproval, type ApprovalView } from '@/lib/hooks/approval-state';
import { useJson } from '@/components/screens/subsidiaries/use-json';
import { fmtDate } from '@/components/screens/subsidiaries/format';
import { ApprovalFlow } from './approval-flow';
import { FlowPanel } from './flow-panel';
import { SpecPanel } from './spec-panel';
import { Stepper } from './stepper';
import { BODY_MAX, MANUAL, MARK_LABEL, TITLE_MAX, readError, safeGithubUrl, statusLabel, statusTone, type ChangeRequest } from './types';

const field = 'w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
const label = 'mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground';

type Busy = 'refine' | 'submit' | 'save' | 'status' | null;
interface Notice { kind: 'error' | 'info'; text: string }

export function ChangeRequestDetailScreen({ id }: { id: string }) {
  const base = `/api/change-requests/${encodeURIComponent(id)}`;
  const { result, retry } = useJson<{ changeRequest: ChangeRequest }>(base);
  const [local, setLocal] = React.useState<ChangeRequest | null>(null);
  const [busy, setBusy] = React.useState<Busy>(null);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [approval, setApproval] = React.useState<ApprovalView | null>(null);
  const [noGithub, setNoGithub] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState('');
  const [editBody, setEditBody] = React.useState('');
  const uid = React.useId();

  const cr = local ?? (result.state === 'ok' ? result.data.changeRequest : null);

  const refetch = () => {
    fetch(base)
      .then(async (res) => { if (res.ok) setLocal(((await res.json()) as { changeRequest: ChangeRequest }).changeRequest); })
      .catch(() => undefined);
  };

  const call = (kind: Exclude<Busy, null>, url: string, init: RequestInit, onOk: (d: Record<string, unknown>) => void, messages: Record<number, string> = {}) => {
    setBusy(kind);
    setNotice(null);
    fetch(url, init)
      .then(async (res) => {
        if (!res.ok) {
          const m = messages[res.status];
          throw new Error(m ?? (await readError(res, `Request failed (${res.status})`)));
        }
        onOk((await res.json()) as Record<string, unknown>);
      })
      .catch((e: unknown) => setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Request failed' }))
      .finally(() => setBusy(null));
  };
  const json = { 'Content-Type': 'application/json' };
  const accept = (d: Record<string, unknown>) => { if (d.changeRequest) setLocal(d.changeRequest as ChangeRequest); };

  const startEdit = (c: ChangeRequest) => { setEditTitle(c.title); setEditBody(c.body); setEditing(true); setNotice(null); };
  const save = () => call('save', base, { method: 'PATCH', headers: json, body: JSON.stringify({ title: editTitle.trim(), body: editBody.trim() }) }, (d) => { accept(d); setEditing(false); setApproval(null); setNoGithub(null); });
  const refine = () => call('refine', `${base}/refine`, { method: 'POST' }, (d) => { accept(d); setNoGithub(null); }, {
    503: 'No model configured. WHINK cannot refine this request until a model is set up on the server. Nothing was saved.',
    502: 'The model could not be reached or did not return a valid spec. Nothing was saved. Try again.',
  });
  const submit = () => call('submit', `${base}/submit`, { method: 'POST' }, (d) => {
    setApproval(null);
    setNoGithub(null);
    if (d.githubConfigured === false) {
      setNoGithub(typeof d.message === 'string' ? d.message.slice(0, 300) : 'GitHub is not configured.');
    } else {
      const a = normalizeApproval(d.approval);
      if (a) setApproval(a);
      else setNotice({ kind: 'error', text: 'The server did not return an approval request. Nothing was sent.' });
    }
    refetch();
  }, { 422: 'The request looks like it contains a secret. Remove it before submitting. Nothing was sent.' });
  const mark = (status: string) => call('status', `${base}/status`, { method: 'POST', headers: json, body: JSON.stringify({ status }) }, accept);

  let body: React.ReactNode;
  if (result.state === 'loading' && !cr) {
    body = <div role="status" aria-busy="true" aria-live="polite"><span className="sr-only">Loading change request</span><div className="h-64 animate-pulse rounded-xl bg-secondary/50 motion-reduce:animate-none" aria-hidden /></div>;
  } else if (result.state === 'notfound') {
    body = <HoloEmpty title="Change request not found" description="It may not be in your account." action={<HoloButton href="/dashboard/change-requests" variant="ghost">All change requests</HoloButton>} />;
  } else if (!cr) {
    body = <HoloEmpty state="error" title="Change request could not be loaded" description="The server did not answer. Nothing was changed." action={<HoloButton onClick={retry}>Retry</HoloButton>} />;
  } else {
    const editable = cr.status === 'DRAFT' || cr.status === 'REFINED';
    const canRefine = editable;
    const canSubmit = ['REFINED', 'AWAITING_APPROVAL', 'FAILED'].includes(cr.status) && cr.spec !== null;
    const issue = safeGithubUrl(cr.githubIssueUrl);
    const transitions = MANUAL[cr.status] ?? [];
    const exportHref = `${base}/export`;
    body = (
      <div className="space-y-6">
        <HoloHeading eyebrow="Change request" title={cr.title} description={`Updated ${fmtDate(cr.updatedAt)}`}
          actions={<HoloBadge tone={statusTone(cr.status)} dot>{statusLabel(cr.status)}</HoloBadge>} />
        <Stepper cr={cr} />

        {notice && (
          <HoloPanel tone={notice.kind === 'error' ? 'ember' : 'accent'} padded className="!p-3" role={notice.kind === 'error' ? 'alert' : 'status'}>
            <p className="text-sm text-foreground"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-widest">{notice.kind === 'error' ? 'Not done' : 'Note'}</span>{notice.text}</p>
          </HoloPanel>
        )}

        <HoloPanel as="section" aria-label="Request" className="space-y-3">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label htmlFor={`${uid}-t`} className={label}>Title</label>
                <input id={`${uid}-t`} className={field} value={editTitle} maxLength={TITLE_MAX} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${uid}-b`} className={label}>Description</label>
                <textarea id={`${uid}-b`} className={field} rows={8} value={editBody} maxLength={BODY_MAX} onChange={(e) => setEditBody(e.target.value)} />
                <p className="mt-1 text-right font-mono text-[0.6875rem] text-muted-foreground">{editBody.length}/{BODY_MAX}</p>
              </div>
              {cr.status === 'REFINED' && <p className="text-xs text-muted-foreground">Saving an edit clears the refined spec. WHINK refines it again.</p>}
              <div className="flex justify-end gap-2">
                <HoloButton variant="ghost" onClick={() => setEditing(false)} disabled={busy === 'save'}>Cancel</HoloButton>
                <HoloButton loading={busy === 'save'} disabled={!editTitle.trim() || !editBody.trim()} onClick={save}>Save changes</HoloButton>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">Your words</h2>
                {editable && <HoloButton size="sm" variant="ghost" leftIcon={<Pencil className="h-3.5 w-3.5" aria-hidden />} onClick={() => startEdit(cr)}>Edit</HoloButton>}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{cr.body}</p>
              {!editable && <p className="text-xs text-muted-foreground">Editing is only possible while the request is a draft or refined.</p>}
            </>
          )}
        </HoloPanel>

        {cr.spec && <SpecPanel spec={cr.spec} />}

        {(canRefine || canSubmit) && !editing && (
          <HoloPanel as="section" aria-label="Next step" className="space-y-4">
            {canRefine && (
              <div className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-foreground">{cr.spec ? 'Refine again' : 'Step 2: WHINK refines it'}</h2>
                <p className="text-sm text-muted-foreground">WHINK reads your words as data and writes a spec. It never acts on instructions hidden inside them.</p>
                <HoloButton loading={busy === 'refine'} onClick={refine} variant={cr.spec ? 'ghost' : 'primary'}>{cr.spec ? 'Refine again' : 'Refine with WHINK'}</HoloButton>
              </div>
            )}
            {canSubmit && !approval && (
              <div className="space-y-2">
                <h2 className="font-display text-lg font-semibold text-foreground">Step 3: You approve</h2>
                <p className="text-sm text-muted-foreground">Submitting does not send anything. It asks for your approval of the exact issue text. That text, which is your words plus the spec, is what would leave your account.</p>
                {cr.status === 'AWAITING_APPROVAL' && (
                  <p className="text-sm text-foreground" role="status"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-widest">Awaiting approval</span>There is no live approval card on this page. The 30 second window may have passed. Submit again to create a new request.</p>
                )}
                <HoloButton loading={busy === 'submit'} onClick={submit}>{cr.status === 'AWAITING_APPROVAL' ? 'Submit again for approval' : 'Submit for approval'}</HoloButton>
              </div>
            )}
          </HoloPanel>
        )}

        {approval && <ApprovalFlow key={approval.id} approval={approval} onDecided={refetch} />}

        {noGithub && (
          <HoloPanel tone="neutral" as="section" aria-label="GitHub not configured" className="space-y-3" role="status">
            <p className="text-sm text-foreground"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-widest text-muted-foreground">GitHub not configured</span>{noGithub}</p>
            <p className="text-sm text-muted-foreground">Nothing was sent. Download the request as markdown and give it to your build agent yourself.</p>
            <HoloButton href={exportHref} variant="ghost" leftIcon={<Download className="h-4 w-4" aria-hidden />}>Download markdown</HoloButton>
          </HoloPanel>
        )}

        {issue && (
          <HoloPanel as="section" aria-label="GitHub issue" className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-foreground">Sent to GitHub</h2>
            <a href={issue} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
              <ExternalLink className="h-4 w-4" aria-hidden />Open the issue{cr.githubIssueNumber ? ` #${cr.githubIssueNumber}` : ''}
            </a>
          </HoloPanel>
        )}

        {transitions.length > 0 && (
          <HoloPanel as="section" aria-label="Mark status" className="space-y-3">
            <h2 className="font-display text-lg font-semibold text-foreground">Mark status</h2>
            <p className="text-sm text-muted-foreground">These controls only record progress that you tell it. They do not merge or change anything on GitHub.</p>
            <div className="flex flex-wrap gap-2">
              {transitions.map((t) => <HoloButton key={t} variant="ghost" size="sm" disabled={busy === 'status'} onClick={() => mark(t)}>{MARK_LABEL[t] ?? t}</HoloButton>)}
            </div>
          </HoloPanel>
        )}

        {cr.spec && !noGithub && (
          <p className="text-xs text-muted-foreground"><a href={exportHref} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"><Download className="h-3 w-3" aria-hidden />Download markdown</a> of this request for your own use. It stays on your device.</p>
        )}
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={40} floor={false} />
      <div className="relative z-10 mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-8">
        <Link href="/dashboard/change-requests" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden />All change requests</Link>
        <FlowPanel />
        {body}
      </div>
    </div>
  );
}
