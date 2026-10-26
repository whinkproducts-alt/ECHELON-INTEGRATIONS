'use client';
// Meeting room. Starting a meeting calls POST /api/meetings/quick-start, which mints an unguessable room link
// on the owner's own meeting server (MEETING_PROVIDER_BASE_URL). With none configured, no room exists and this
// screen says exactly what to set. No public meeting service is ever contacted from here.
import * as React from 'react';
import Image from 'next/image';
import { Check, Copy, ExternalLink, Video } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloHeading, HoloOrbBackdrop, HoloPanel } from '@/components/ui/holo';
import { useTenantConfig } from '@/lib/hooks/useTenantConfig';
import { safeMeetingUrl, type MeetingPerson, type MeetingScreenProps } from './props';

type Phase =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'ready'; url: string; email: string | null }
  | { kind: 'not_configured'; email: string | null }
  | { kind: 'error'; message: string };

function Portrait({ person, size }: { person: MeetingPerson; size: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-full border border-border bg-[hsl(var(--surface))] ${size}`}>
      {person.imageUrl
        ? <Image src={person.imageUrl} alt="" fill sizes="96px" className="object-cover object-top" />
        : <span className="flex h-full items-center justify-center font-display text-muted-foreground" aria-hidden>{person.name.slice(0, 1)}</span>}
    </span>
  );
}

function CopyLink({ url }: { url: string }) {
  const [state, setState] = React.useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    const p = navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject(new Error('no clipboard'));
    p.then(() => setState('copied')).catch(() => setState('failed'));
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <>
      <HoloButton variant="ghost" onClick={copy} leftIcon={state === 'copied' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}>
        {state === 'copied' ? 'Link copied' : 'Copy link'}
      </HoloButton>
      <span role="status" aria-live="polite" className="sr-only">{state === 'copied' ? 'Link copied' : state === 'failed' ? 'Copy failed. Select the link and copy it by hand.' : ''}</span>
    </>
  );
}

function plainEmail(v: unknown): string | null {
  return typeof v === 'string' && /^[^\s@<>]{1,64}@[^\s@<>]{1,200}$/.test(v) ? v : null;
}

export function MeetingScreen({ host, invitees }: Partial<MeetingScreenProps>) {
  const { productName } = useTenantConfig();
  const [phase, setPhase] = React.useState<Phase>({ kind: 'idle' });
  const people = invitees ?? [];

  const start = () => {
    if (!host || phase.kind === 'starting') return;
    setPhase({ kind: 'starting' });
    fetch('/api/meetings/quick-start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assistantName: host.name, assistantEmail: host.email }),
    })
      .then(async (r) => {
        if (r.status === 401) { setPhase({ kind: 'error', message: 'Your session ended. Sign in again, then retry.' }); return; }
        if (r.status === 403) { setPhase({ kind: 'error', message: 'You do not have permission to start a meeting room.' }); return; }
        if (!r.ok) { setPhase({ kind: 'error', message: 'The server could not start the meeting. Nothing was created. Try again.' }); return; }
        const d = (await r.json().catch(() => null)) as { meetingUrl?: unknown; fallback?: { email?: unknown } } | null;
        const email = plainEmail(d?.fallback?.email) ?? host.email;
        const url = safeMeetingUrl(d?.meetingUrl);
        if (url) setPhase({ kind: 'ready', url, email });
        else if (d?.meetingUrl) setPhase({ kind: 'error', message: 'The server returned a room link that is not a web address, so it was not used.' });
        else setPhase({ kind: 'not_configured', email });
      })
      .catch(() => setPhase({ kind: 'error', message: 'Could not reach the server. Nothing was created.' }));
  };

  return (
    <div className="relative isolate">
      <HoloOrbBackdrop stars={50} />
      <div className="relative mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-8">
        <HoloHeading eyebrow="Governance" title="Meeting room"
          description="Open a private video room on your own meeting server and bring the board in." />

        {!host ? (
          <HoloEmpty title="No meeting host is set up" description="The board roster has no executive assistant with a staff email, so a quick meeting cannot be started. Add one to the board configuration." />
        ) : (
          <HoloPanel glow="soft" brackets className="space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              <Portrait person={host} size="h-16 w-16" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl font-semibold text-foreground">Start a meeting with {host.name}</h2>
                <p className="text-sm text-muted-foreground">{host.seat ?? 'Host'}</p>
                <p className="font-mono text-xs text-muted-foreground">{host.email}</p>
              </div>
              <HoloButton size="lg" onClick={start} loading={phase.kind === 'starting'} leftIcon={<Video className="h-5 w-5" aria-hidden />}>
                {phase.kind === 'ready' ? 'Start a new room' : 'Start meeting'}
              </HoloButton>
            </div>

            <div aria-live="polite">
              {phase.kind === 'idle' && (
                <p className="text-sm text-muted-foreground">
                  A new room gets its own long random address. Starting one is recorded in the ledger. {productName} does not message anyone, so share the link with the people you want in the room.
                </p>
              )}
              {phase.kind === 'starting' && <p className="text-sm text-muted-foreground">Creating the room</p>}
              {phase.kind === 'error' && (
                <p role="alert" className="text-sm text-foreground"><span className="font-mono text-xs uppercase tracking-wider text-[hsl(var(--ember))]">Error: </span>{phase.message}</p>
              )}
            </div>

            {phase.kind === 'ready' && (
              <div className="space-y-3 rounded-lg border border-primary/40 bg-[hsl(var(--deep)/0.25)] p-4">
                <HoloBadge tone="accent" dot>Room ready</HoloBadge>
                <p className="break-all font-mono text-xs text-muted-foreground">{phase.url}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <HoloButton size="lg" leftIcon={<ExternalLink className="h-5 w-5" aria-hidden />}
                    onClick={() => { window.open(phase.url, '_blank', 'noopener,noreferrer'); }}>
                    Join room
                  </HoloButton>
                  <CopyLink url={phase.url} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Opens in a new tab. If it does not load{phase.email ? <>, contact {host.name} at <a className="text-primary underline underline-offset-2" href={`mailto:${phase.email}`}>{phase.email}</a></> : ''}.
                </p>
              </div>
            )}

            {phase.kind === 'not_configured' && (
              <div className="space-y-3 rounded-lg border border-border p-4" role="status">
                <HoloBadge tone="neutral">Not configured</HoloBadge>
                <p className="text-sm text-foreground">No meeting room was created, because no meeting server is set up (or its address is not valid).</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Run your own meeting server, for example a self-hosted Jitsi Meet.</li>
                  <li>Set <code className="font-mono text-foreground">MEETING_PROVIDER_BASE_URL</code> on the server to its address, for example <code className="font-mono text-foreground">https://meet.example.com</code>.</li>
                  <li>Use https. Plain http is accepted only for localhost. The address must have no username, password, query or fragment.</li>
                  <li>Restart the app and start the meeting again.</li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  No public meeting service is contacted. Until then, contact {host.name} directly{phase.email ? <> at <a className="text-primary underline underline-offset-2" href={`mailto:${phase.email}`}>{phase.email}</a></> : ''}.
                </p>
              </div>
            )}
          </HoloPanel>
        )}

        <section aria-labelledby="invitees-title" className="space-y-3">
          <h2 id="invitees-title" className="font-display text-2xl font-semibold text-foreground">Board members to invite</h2>
          {people.length === 0 ? (
            <HoloEmpty title="No board members listed" description="Add members to the board configuration and they appear here." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-[hsl(var(--surface)/0.6)] p-3">
                  <Portrait person={p} size="h-10 w-10" />
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
