'use client';
// Settings > Passkeys. Lists the caller's own passkeys, adds this device, removes one after a confirm.
// Never shows keys or credential ids (the API does not return them). All API text is rendered as text.
import * as React from 'react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Fingerprint, Plus, Trash2 } from 'lucide-react';
import { HoloBadge, HoloButton, HoloEmpty, HoloModal, HoloPanel } from '@/components/ui/holo';

const MAX_PASSKEYS = 10;

interface Passkey { id: string; deviceName: string; createdAt: string; lastUsedAt: string | null }
type Load = { state: 'loading' } | { state: 'error' } | { state: 'ok'; items: Passkey[] };

function coarseDeviceName(): string {
  // A coarse family name only (no version, screen or hardware detail), so it cannot be used to fingerprint.
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android device';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux|X11/.test(ua)) return 'Linux computer';
  return 'This device';
}

function fmt(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'unknown' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function parsePasskeys(v: unknown): Passkey[] {
  const list = typeof v === 'object' && v !== null && Array.isArray((v as { passkeys?: unknown }).passkeys) ? (v as { passkeys: unknown[] }).passkeys : [];
  return list.flatMap((r) => {
    if (typeof r !== 'object' || r === null) return [];
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string') return [];
    return [{ id: o.id, deviceName: typeof o.deviceName === 'string' ? o.deviceName : 'Unnamed device', createdAt: typeof o.createdAt === 'string' ? o.createdAt : '', lastUsedAt: typeof o.lastUsedAt === 'string' ? o.lastUsedAt : null }];
  });
}

export function PasskeysPanel() {
  const router = useRouter();
  const [load, setLoad] = React.useState<Load>({ state: 'loading' });
  const [deviceName, setDeviceName] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [notConfigured, setNotConfigured] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const refresh = React.useCallback(() => {
    return fetch('/api/auth/passkey')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((data) => setLoad({ state: 'ok', items: parsePasskeys(data) }))
      .catch(() => setLoad({ state: 'error' }));
  }, []);

  React.useEffect(() => {
    let live = true;
    Promise.resolve().then(() => { if (live) setDeviceName((n) => n || coarseDeviceName()); });
    fetch('/api/auth/passkey')
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((data) => { if (live) setLoad({ state: 'ok', items: parsePasskeys(data) }); })
      .catch(() => { if (live) setLoad({ state: 'error' }); });
    return () => { live = false; };
  }, []);

  const count = load.state === 'ok' ? load.items.length : 0;
  const atCap = count >= MAX_PASSKEYS;

  type Reauth = { password: string } | { ticket: string };
  const [reauth, setReauth] = React.useState<{ action: 'add' } | { action: 'remove'; pk: Passkey } | null>(null);
  const [password, setPassword] = React.useState('');
  const [reauthError, setReauthError] = React.useState<string | null>(null);
  const [reauthBusy, setReauthBusy] = React.useState(false);

  const openReauth = (r: NonNullable<typeof reauth>) => { setPassword(''); setReauthError(null); setMessage(null); setReauth(r); };
  const closeReauth = () => { if (!reauthBusy) { setReauth(null); setPassword(''); } };

  // The server signs the current session out after a change and returns a one-time ticket; use it straight away.
  const resume = async (ticket: unknown) => {
    const res = typeof ticket === 'string' ? await signIn('passkey', { ticket, redirect: false }).catch(() => null) : null;
    if (!res || res.error) {
      router.replace('/login');
      return false;
    }
    return true;
  };

  const reauthErrorFor = (status: number) =>
    status === 403 ? 'That did not match' : status === 429 ? 'Too many tries. Wait a minute and try again.' : null;

  const reauthWithPasskey = async () => {
    setReauthError(null);
    setReauthBusy(true);
    try {
      const o = await fetch('/api/auth/passkey/login/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reauth: true }) });
      if (!o.ok) { setReauthError(reauthErrorFor(o.status) ?? 'Could not start the passkey check. Try your password.'); return; }
      const { options, challengeId } = await o.json();
      let response;
      try { response = await startAuthentication({ optionsJSON: options }); } catch (e) {
        const n = e instanceof Error ? e.name : '';
        if (n === 'NotAllowedError' || n === 'AbortError') return;
        setReauthError('That did not match'); return;
      }
      const v = await fetch('/api/auth/passkey/login/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, response }) });
      if (!v.ok) { setReauthError(v.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'That did not match'); return; }
      const { ticket } = await v.json();
      if (typeof ticket !== 'string') { setReauthError('That did not match'); return; }
      await proceed({ ticket });
    } catch {
      setReauthError('Could not reach the server. Try again.');
    } finally {
      setReauthBusy(false);
    }
  };

  const proceed = async (proof: Reauth) => {
    if (!reauth) return;
    if (reauth.action === 'add') await runAdd(proof);
    else await runRemove(reauth.pk, proof);
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setReauthError(null);
    setReauthBusy(true);
    try { await proceed({ password }); } finally { setReauthBusy(false); setPassword(''); }
  };

  const runAdd = async (proof: Reauth) => {
    try {
      const optRes = await fetch('/api/auth/passkey/register/options', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proof) });
      const rErr = reauthErrorFor(optRes.status);
      if (rErr) { setReauthError(rErr); return; }
      setReauth(null);
      if (optRes.status === 503) { setNotConfigured(true); return; }
      if (optRes.status === 409) { setMessage({ kind: 'error', text: `You already have ${MAX_PASSKEYS} passkeys. Remove one first.` }); return; }
      if (!optRes.ok) { setMessage({ kind: 'error', text: 'Could not start passkey setup. Try again.' }); return; }
      const { options, challengeId } = await optRes.json();
      setAdding(true);
      let response;
      try {
        response = await startRegistration({ optionsJSON: options });
      } catch (e) {
        const name = e instanceof Error ? e.name : '';
        if (name === 'NotAllowedError' || name === 'AbortError') return; // cancelled: quiet
        if (name === 'InvalidStateError') { setMessage({ kind: 'error', text: 'This device already has a passkey for this account.' }); return; }
        setMessage({ kind: 'error', text: 'This device could not create a passkey.' });
        return;
      }
      const verRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, deviceName: deviceName.trim() || undefined, response }),
      });
      if (!verRes.ok) { setMessage({ kind: 'error', text: 'The passkey could not be verified. Nothing was added.' }); return; }
      const data = await verRes.json().catch(() => null);
      if (!(await resume(data?.ticket))) return;
      setMessage({ kind: 'info', text: 'Passkey added.' });
      await refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server. Try again.' });
    } finally {
      setAdding(false);
    }
  };

  const runRemove = async (pk: Passkey, proof: Reauth) => {
    try {
      const r = await fetch(`/api/auth/passkey/${encodeURIComponent(pk.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proof) });
      const rErr = reauthErrorFor(r.status);
      if (rErr) { setReauthError(rErr); return; }
      setReauth(null);
      if (r.ok) {
        const data = await r.json().catch(() => null);
        if (!(await resume(data?.ticket))) return;
        setMessage({ kind: 'info', text: 'Passkey removed.' });
      } else if (r.status === 404) {
        setMessage({ kind: 'info', text: 'That passkey was already removed.' });
      } else {
        setMessage({ kind: 'error', text: 'Could not remove the passkey. Try again.' });
      }
      await refresh();
    } catch {
      setMessage({ kind: 'error', text: 'Could not reach the server. Try again.' });
    }
  };

  return (
    <section aria-labelledby="passkeys-heading" className="space-y-3">
      <h2 id="passkeys-heading" className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.28em] text-muted-foreground">
        <Fingerprint className="h-3.5 w-3.5" aria-hidden /> Passkeys
      </h2>
      <HoloPanel tone="accent" className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A passkey lets you sign in with Touch ID, Face ID or your device PIN instead of a password. It stays on your device; only a public key is stored here.
        </p>

        {notConfigured && (
          <HoloEmpty state="error" title="Passkeys are not set up on this server" description="The server administrator needs to set the passkey domain and origin before passkeys can be added." />
        )}

        {load.state === 'loading' && <HoloEmpty state="loading" title="Loading passkeys" />}
        {load.state === 'error' && (
          <HoloEmpty state="error" title="Passkeys did not load" description="The list could not be read right now."
            action={<HoloButton size="sm" variant="ghost" onClick={() => { setLoad({ state: 'loading' }); void refresh(); }}>Try again</HoloButton>} />
        )}
        {load.state === 'ok' && load.items.length === 0 && (
          <HoloEmpty icon={<Fingerprint className="h-6 w-6" aria-hidden />} title="No passkeys yet" description="Add this device to sign in with Touch ID next time." />
        )}
        {load.state === 'ok' && load.items.length > 0 && (
          <ul className="space-y-2">
            {load.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.deviceName}</p>
                  <p className="font-mono text-xs text-muted-foreground">Added {fmt(p.createdAt)} · Last used {fmt(p.lastUsedAt)}</p>
                </div>
                <HoloButton size="sm" variant="ghost" magnetic={false} leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => openReauth({ action: 'remove', pk: p })} aria-label={`Remove passkey ${p.deviceName}`}>Remove</HoloButton>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor="passkey-device-name" className="mb-1.5 block text-sm font-medium text-muted-foreground">Device name</label>
            <input id="passkey-device-name" type="text" value={deviceName} maxLength={80} onChange={(e) => setDeviceName(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <HoloButton onClick={() => openReauth({ action: 'add' })} loading={adding} disabled={atCap || notConfigured || load.state !== 'ok'} leftIcon={<Plus className="h-4 w-4" aria-hidden />}>
            Add this device
          </HoloButton>
        </div>
        <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
          <HoloBadge tone="neutral">{count} of {MAX_PASSKEYS} used</HoloBadge>
          {atCap && <span>Limit reached. Remove one to add another.</span>}
        </p>

        <div aria-live="polite">
          {message && <p role={message.kind === 'error' ? 'alert' : 'status'} className="text-sm text-foreground">{message.kind === 'error' ? 'Error: ' : ''}{message.text}</p>}
        </div>
      </HoloPanel>

      <HoloModal open={reauth !== null} onOpenChange={(o) => { if (!o) closeReauth(); }} title="Confirm it is you"
        description={reauth?.action === 'remove' ? `Removing ${reauth.pk.deviceName} means it can no longer sign in with this passkey. Your password still works.` : 'Adding a passkey changes how your account can be accessed.'}>
        <form onSubmit={(e) => void submitPassword(e)} className="space-y-3">
          <div>
            <label htmlFor="passkey-reauth-password" className="mb-1.5 block text-sm font-medium text-muted-foreground">Password</label>
            <input id="passkey-reauth-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div aria-live="polite">{reauthError && <p role="alert" className="text-sm text-foreground">Error: {reauthError}</p>}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <HoloButton variant="ghost" onClick={closeReauth} disabled={reauthBusy}>Cancel</HoloButton>
            {load.state === 'ok' && load.items.length > 0 && (
              <HoloButton variant="ghost" onClick={() => void reauthWithPasskey()} disabled={reauthBusy} leftIcon={<Fingerprint className="h-4 w-4" aria-hidden />}>Use an existing passkey</HoloButton>
            )}
            <HoloButton type="submit" variant={reauth?.action === 'remove' ? 'danger' : 'primary'} tone={reauth?.action === 'remove' ? 'ember' : 'accent'} loading={reauthBusy} disabled={!password}>
              {reauth?.action === 'remove' ? 'Remove passkey' : 'Continue'}
            </HoloButton>
          </div>
          <p className="text-xs text-muted-foreground">Password checks are limited to 5 tries a minute.</p>
        </form>
      </HoloModal>
    </section>
  );
}

export default PasskeysPanel;
