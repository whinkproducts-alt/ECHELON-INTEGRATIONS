'use client';
// Contract detail. Props: { id: string }. GET/PATCH/DELETE /api/contracts/[id]. Notes are untrusted plain text.
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloModal, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { SubsidiaryChip, projectReportHref } from '@/components/subsidiaries';
import { fmtDate, fmtDateTime } from '@/components/screens/subsidiaries/format';
import { useJson } from '@/components/screens/subsidiaries/use-json';
import { ContractFormView } from './contract-form';
import { renewalText } from './contract-row';
import { useNow } from './use-now';
import { fmtMoney, readError, statusLabel, statusTone, type Contract } from './types';

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/60 py-2 last:border-0 sm:grid-cols-[10rem_1fr]">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function ContractDetailScreen({ id }: { id: string }) {
  const router = useRouter();
  const now = useNow();
  const url = `/api/contracts/${encodeURIComponent(id)}`;
  const { result, retry } = useJson<{ contract: Contract }>(url);
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const remove = () => {
    setBusy(true);
    setError(null);
    fetch(url, { method: 'DELETE' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `Could not delete (${res.status})`));
        router.replace('/dashboard/contracts');
      })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : 'Could not delete'); setBusy(false); });
  };

  let body: React.ReactNode;
  if (result.state === 'loading') {
    body = <div role="status" aria-busy="true" aria-live="polite"><span className="sr-only">Loading contract</span><div className="h-64 animate-pulse rounded-xl bg-secondary/50 motion-reduce:animate-none" aria-hidden /></div>;
  } else if (result.state === 'notfound') {
    body = <HoloEmpty title="Contract not found" description="It may have been deleted, or it is not in your account." action={<HoloButton href="/dashboard/contracts" variant="ghost">All contracts</HoloButton>} />;
  } else if (result.state === 'error') {
    body = <HoloEmpty state="error" title="Contract could not be loaded" description="The server did not answer. Nothing was changed." action={<HoloButton onClick={retry}>Retry</HoloButton>} />;
  } else {
    const c = result.data.contract;
    const renewal = renewalText(c, now);
    body = (
      <div className="space-y-6">
        <HoloHeading eyebrow="Contract" title={c.title} description={c.counterparty}
          actions={<>
            <HoloButton variant="ghost" leftIcon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditing(true)}>Edit</HoloButton>
            <HoloButton variant="danger" leftIcon={<Trash2 className="h-4 w-4" aria-hidden />} onClick={() => setConfirming(true)}>Delete</HoloButton>
          </>} />
        <HoloPanel className="space-y-1">
          <dl>
            <Row k="Status"><HoloBadge tone={statusTone(c.status)} dot>{statusLabel(c.status)}</HoloBadge></Row>
            <Row k="Subsidiary"><SubsidiaryChip id={c.subsidiary} href={c.subsidiary ? `/dashboard/subsidiaries/${encodeURIComponent(c.subsidiary)}` : undefined} /></Row>
            <Row k="Value"><span className="font-mono tabular-nums">{fmtMoney(c.valueAmount, c.currency)}</span></Row>
            <Row k="Start"><span className="font-mono">{fmtDate(c.startDate)}</span></Row>
            <Row k="End"><span className="font-mono">{fmtDate(c.endDate)}</span></Row>
            <Row k="Renewal">
              <span className="font-mono">{fmtDate(c.renewalDate)}</span>
              {renewal && <span className="ml-3 inline-flex items-center gap-1.5 text-xs"><CalendarClock className="h-3.5 w-3.5 text-primary" aria-hidden />{renewal}</span>}
            </Row>
            <Row k="Project">
              {c.projectId
                ? <Link href={projectReportHref(c.projectId, c.subsidiary)} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"><ExternalLink className="h-3.5 w-3.5" aria-hidden />Open the project report</Link>
                : <span className="text-muted-foreground">Not linked</span>}
            </Row>
            <Row k="Recorded"><span className="font-mono text-xs">{fmtDateTime(new Date(c.createdAt))}</span></Row>
          </dl>
        </HoloPanel>
        <HoloPanel as="section" aria-label="Notes">
          <h2 className="mb-2 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">Notes (plain text)</h2>
          {c.notes ? <p className="whitespace-pre-wrap break-words text-sm text-foreground">{c.notes}</p> : <p className="text-sm text-muted-foreground">No notes.</p>}
        </HoloPanel>
        <p className="text-xs text-muted-foreground">Recording or editing a contract does not move money or send anything.</p>

        <HoloModal open={editing} onOpenChange={setEditing} title="Edit contract" width="40rem">
          <ContractFormView initial={c} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); retry(); }} />
        </HoloModal>
        <HoloModal open={confirming} onOpenChange={(o) => { if (!busy) setConfirming(o); }} tone="ember" title="Delete this contract?"
          description="The record is removed from your account. This cannot be undone. Nothing is cancelled with the counterparty."
          footer={<>
            <HoloButton variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Keep it</HoloButton>
            <HoloButton variant="danger" loading={busy} onClick={remove}>Delete contract</HoloButton>
          </>}>
          <p className="break-words text-sm text-foreground">{c.title}</p>
          {error && <p className="mt-3 text-sm text-foreground" role="alert"><span className="mr-2 font-mono text-[0.6875rem] uppercase tracking-widest text-[hsl(var(--ember))]">Error</span>{error}</p>}
        </HoloModal>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-full overflow-hidden">
      <HoloOrbBackdrop stars={40} floor={false} />
      <div className="relative z-10 mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
        <Link href="/dashboard/contracts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden />All contracts</Link>
        {body}
      </div>
    </div>
  );
}
