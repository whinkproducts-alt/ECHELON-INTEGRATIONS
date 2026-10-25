'use client';
// Message / Call composer. Flow:
//   1. compose: shows the EXACT content and who it goes to. Nothing is sent.
//   2. POST /api/contacts/[id]/message or /call creates a Class C approval request and returns its id.
//   3. the existing ApprovalCard shows the request with the amber 30 s countdown. Approve / Deny send the id.
// The server reports "not configured" after approval when delivery is a stub; we say so plainly.
import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { ApprovalCard } from '@/app/dashboard/conversation/_components/approval-card';
import {
  approvalReducer, initialCardState, isTerminal, normalizeApproval, postDecision,
  type ApprovalView,
} from '@/lib/hooks/approval-state';
import { generateConfirmationCode } from '@/lib/spoken-approval';
import { HoloBadge, HoloButton, HoloPanel } from '@/components/ui/holo';
import { cn } from '@/lib/utils';
import {
  BODY_MAX, CHANNEL_LABEL, SCRIPT_MAX, channelAvailable, readError,
  type Channel, type Contact,
} from './types';

const CHANNELS: Channel[] = ['SMS', 'WHATSAPP', 'TELEGRAM', 'EMAIL', 'PHONE_CALL'];
const field = 'w-full rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';

type Casl = 'review_consent' | 'prior_relationship' | null;

function destination(c: Contact, ch: Channel): string {
  if (ch === 'EMAIL') return c.email ?? '';
  if (ch === 'TELEGRAM') return c.tags.find((t) => /^telegram:-?\d{1,20}$/.test(t))?.slice('telegram:'.length) ?? '';
  return c.phone ?? '';
}

export function ContactComposer({ contact, initialChannel, onClose }: { contact: Contact; initialChannel: Channel; onClose: () => void }) {
  const first = channelAvailable(contact, initialChannel).ok ? initialChannel : (CHANNELS.find((c) => channelAvailable(contact, c).ok) ?? initialChannel);
  const [channel, setChannel] = React.useState<Channel>(first);
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [approval, setApproval] = React.useState<ApprovalView | null>(null);
  const [casl, setCasl] = React.useState<Casl>(null);
  const [code, setCode] = React.useState('');
  const [card, dispatch] = React.useReducer(approvalReducer, initialCardState);
  const cardRef = React.useRef(card);
  React.useEffect(() => { cardRef.current = card; }, [card]);
  const uid = React.useId();

  const isCall = channel === 'PHONE_CALL';
  const max = isCall ? SCRIPT_MAX : BODY_MAX;
  const avail = channelAvailable(contact, channel);
  const canRequest = avail.ok && (isCall || text.trim().length > 0) && text.length <= max;

  const request = () => {
    setBusy(true);
    setError(null);
    const url = `/api/contacts/${encodeURIComponent(contact.id)}/${isCall ? 'call' : 'message'}`;
    const body = isCall ? { script: text.trim() || undefined } : { channel, body: text.trim() };
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, `Request failed (${res.status})`));
        const d = (await res.json()) as { approval?: unknown; casl?: unknown };
        const a = normalizeApproval(d.approval);
        if (!a) throw new Error('The server did not return an approval request. Nothing was sent.');
        setCasl(d.casl === 'review_consent' || d.casl === 'prior_relationship' ? d.casl : null);
        setCode(generateConfirmationCode());
        setApproval(a);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Request failed'))
      .finally(() => setBusy(false));
  };

  const decide = (decision: 'approve' | 'deny') => {
    if (!approval || cardRef.current.phase !== 'pending') return;
    dispatch({ type: 'submit' });
    postDecision(approval.id, decision)
      .then((response) => dispatch({ type: 'response', response }))
      .catch((e: unknown) => dispatch({ type: 'request_failed', message: e instanceof Error ? e.message : 'Request failed' }));
  };

  const notConfigured = card.phase === 'failed' && /not[_ ]configured/i.test(card.detail ?? '');
  const sent = card.phase === 'executed';

  if (approval) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>Request <span className="font-mono text-foreground">{approval.id}</span> is waiting for you. Nothing is sent until you approve this exact request.</span>
        </p>
        {casl === 'review_consent' && (
          <HoloPanel tone="ember" padded className="!p-3" role="note">
            <p className="text-xs text-foreground">
              <span className="mr-2 font-mono uppercase tracking-widest text-[hsl(var(--ember))]">CASL consent check</span>
              There is no earlier record of contact with {contact.name}. Canada&apos;s anti-spam law requires consent for commercial messages. Approve only if you have it.
            </p>
          </HoloPanel>
        )}
        <ApprovalCard
          className="w-full"
          approval={approval}
          code={code}
          state={card}
          onTick={(secondsLeft) => dispatch({ type: 'tick', secondsLeft })}
          onDecide={decide}
        />
        {notConfigured && (
          <HoloPanel tone="neutral" padded className="!p-3" role="status">
            <p className="text-xs text-foreground"><span className="mr-2 font-mono uppercase tracking-widest text-muted-foreground">Not configured</span>
              Delivery for {CHANNEL_LABEL[channel]} is not set up on this server, so nothing was sent or placed. Your approval was recorded.</p>
          </HoloPanel>
        )}
        {sent && <p className="text-xs text-muted-foreground" role="status">Delivered once, as approved.</p>}
        {isTerminal(card.phase) && (
          <div className="flex justify-end"><HoloButton variant="ghost" onClick={onClose}>Close</HoloButton></div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Channel" className="flex flex-wrap gap-2">
        {CHANNELS.map((ch) => {
          const a = channelAvailable(contact, ch);
          return (
            <button
              key={ch} type="button" role="tab" aria-selected={channel === ch} disabled={!a.ok} title={a.why}
              onClick={() => { setChannel(ch); setError(null); }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40',
                channel === ch ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {CHANNEL_LABEL[ch]}
            </button>
          );
        })}
      </div>
      {!avail.ok && <p className="text-xs text-muted-foreground" role="status">{avail.why}. Edit the contact to add it.</p>}

      <div>
        <label htmlFor={`${uid}-text`} className="mb-1 block font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          {isCall ? 'Call script (optional)' : 'Message'}
        </label>
        <textarea
          id={`${uid}-text`} className={field} rows={5} value={text} maxLength={max}
          onChange={(e) => setText(e.target.value)} disabled={!avail.ok}
          placeholder={isCall ? 'What should be said on the call' : 'Write the message exactly as it should be sent'}
          aria-describedby={`${uid}-count`}
        />
        <p id={`${uid}-count`} className="mt-1 text-right font-mono text-[0.6875rem] text-muted-foreground">{text.length}/{max}</p>
      </div>

      <section aria-label="Exact content preview" className="rounded-md border border-border bg-background/40 p-3">
        <p className="mb-2 flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          Exact content that will be sent <HoloBadge tone="neutral">Not sent yet</HoloBadge>
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">To</dt><dd className="break-all font-mono text-foreground">{contact.name} {avail.ok ? `(${destination(contact, channel)})` : ''}</dd>
          <dt className="text-muted-foreground">Via</dt><dd className="font-mono text-foreground">{CHANNEL_LABEL[channel]}</dd>
        </dl>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-secondary p-2 font-mono text-xs text-foreground">{text || (isCall ? '(no script)' : '(empty)')}</pre>
      </section>

      <p className="text-xs text-muted-foreground">
        Submitting creates an approval request. Nothing is sent until you approve it by its id within 30 seconds.
      </p>
      {error && <p role="alert" className="text-xs text-foreground"><span className="mr-2 font-mono uppercase tracking-widest text-[hsl(var(--ember))]">Error</span>{error}</p>}
      <div className="flex justify-end gap-2">
        <HoloButton variant="ghost" onClick={onClose}>Cancel</HoloButton>
        <HoloButton onClick={request} loading={busy} disabled={!canRequest}>{isCall ? 'Request call approval' : 'Request send approval'}</HoloButton>
      </div>
    </div>
  );
}
