'use client';
// Detail drawer for one approval request: what it was, the exact content (already redacted by the
// server), what happened, and the ledger trail. All text from the API is untrusted and shown as text.
import * as React from 'react';
import Link from 'next/link';
import { HoloButton, HoloDrawer, HoloEmpty } from '@/components/ui/holo';
import { CopyButton, ProtectedChip, StatusChip } from '@/components/screens/ledger/controls';
import { fmtTime, humanize } from '@/components/screens/ledger/format';
import { useJson } from '@/components/screens/ledger/use-json';
import { KIND_LABEL, stringifyUntrusted, type HistoryDetail } from './types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function Body({ id, onRetry, nonce }: { id: string; onRetry: () => void; nonce: number }) {
  const { loading, status, data } = useJson<HistoryDetail>(`/api/approvals/history/${encodeURIComponent(id)}`, nonce);
  if (loading) return <HoloEmpty state="loading" title="Loading details" />;
  if (status === 404) return <HoloEmpty title="Request not found" description="It may belong to another account or no longer exist. Nothing was changed." />;
  if (status !== 200 || !data || !data.approval || !Array.isArray(data.ledger)) {
    return <HoloEmpty state="error" title="Details did not load" description="Nothing was changed. Try again."
      action={<HoloButton size="sm" variant="ghost" onClick={onRetry}>Try again</HoloButton>} />;
  }
  const a = data.approval;
  const waiting = a.status === 'AWAITING_APPROVAL';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={a.status} />
        <ProtectedChip category={a.protected ? a.category : null} />
      </div>
      {a.protected && <p className="text-xs text-muted-foreground">Needs your approval every time. It cannot be delegated.</p>}
      {waiting && <p className="text-sm text-foreground">This request is still waiting. Decide it from the card at the top of the Approvals page.</p>}

      <p className="whitespace-pre-wrap break-words text-sm text-foreground">{a.summary ?? '(no description)'}</p>

      <dl className="divide-y divide-border/60 rounded-md border border-border px-3">
        <Row label="Type">{KIND_LABEL[a.kind] ?? humanize(a.kind)}</Row>
        <Row label="Tool"><span className="font-mono text-xs">{a.tool ?? '--'}</span></Row>
        <Row label="Class">{a.permissionClass}</Row>
        <Row label="Mind">{a.persona}</Row>
        <Row label="Asked">{fmtTime(a.createdAt)}</Row>
        <Row label={waiting ? 'Expires' : 'Window closed'}>{fmtTime(a.expiresAt)}</Row>
        <Row label="Decided">{a.decidedAt ? `${fmtTime(a.decidedAt)}${a.decidedBy ? ' by you' : ''}` : 'Not decided'}</Row>
        <Row label="Ran">{a.executedAt ? fmtTime(a.executedAt) : 'Did not run'}</Row>
        <Row label="Request id">
          <span className="inline-flex items-center gap-1"><span className="break-all font-mono text-xs">{a.id}</span><CopyButton value={a.id} label="Copy request id" /></span>
        </Row>
        <Row label="Correlation id">
          <span className="inline-flex flex-wrap items-center gap-1">
            <span className="break-all font-mono text-xs">{a.correlationId}</span>
            <CopyButton value={a.correlationId} label="Copy correlation id" />
            <Link href={`/dashboard/ledger?correlationId=${encodeURIComponent(a.correlationId)}`} className="text-xs text-primary underline underline-offset-2">Open in ledger</Link>
          </span>
        </Row>
      </dl>

      <section aria-label="Exact content">
        <h3 className="mb-1 text-xs text-muted-foreground">Exact content (secrets are hidden by the server)</h3>
        <pre tabIndex={0} aria-label="Exact parameters" className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-secondary p-2 font-mono text-xs text-foreground">{stringifyUntrusted(a.params)}</pre>
      </section>

      <section aria-label="Outcome">
        <h3 className="mb-1 text-xs text-muted-foreground">Outcome</h3>
        {a.outcome.result == null
          ? <p className="text-sm text-muted-foreground">{a.status === 'EXECUTED' || a.status === 'FAILED' ? 'No result was recorded.' : 'Nothing ran, so there is no result.'}</p>
          : <pre tabIndex={0} aria-label="Outcome result" className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-secondary p-2 font-mono text-xs text-foreground">{stringifyUntrusted(a.outcome.result)}</pre>}
      </section>

      <section aria-label="Ledger trail">
        <h3 className="mb-2 text-xs text-muted-foreground">Ledger trail</h3>
        {data.ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ledger rows are linked to this request.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-border pl-4">
            {data.ledger.map((l) => (
              <li key={l.id} className="relative">
                <span className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-foreground">{l.action}</span>
                  <StatusChip status={l.status} />
                </div>
                <p className="font-mono text-[0.6875rem] text-muted-foreground">{fmtTime(l.createdAt)}</p>
                {l.outputSummary && <p className="mt-0.5 break-words text-xs text-muted-foreground">{l.outputSummary}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function ApprovalDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [nonce, setNonce] = React.useState(0);
  return (
    <HoloDrawer open={id !== null} onOpenChange={(o) => { if (!o) onClose(); }} title="Approval details"
      description="What was asked, what you decided, and what happened." width="32rem">
      {id !== null && <Body key={id} id={id} nonce={nonce} onRetry={() => setNonce((n) => n + 1)} />}
    </HoloDrawer>
  );
}
