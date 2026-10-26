'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, TimerOff } from 'lucide-react';
import { AuthShell, Field, PASSWORD_MIN_LENGTH, PASSWORD_RULES, PasswordInput, StrengthHint, SubmitButton, btnPrimary } from '@/components/screens/landing/ui';
import { cn } from '@/lib/utils';

type Phase = 'form' | 'done' | 'expired';

export function ResetForm() {
  // The token is read from the address once, after hydration, then removed from the address bar and history.
  // It lives in state only and is never logged. `ready` keeps server and first client render identical.
  const [token, setToken] = useState('');
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let live = true;
    // Read synchronously (no state change) so a StrictMode re-run still sees the token; strip in the microtask.
    const t = new URLSearchParams(window.location.search).get('token') ?? '';
    Promise.resolve().then(() => {
      if (t) window.history.replaceState(null, '', window.location.pathname);
      if (!live) return;
      setToken(t);
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  const mismatch = confirm.length > 0 && confirm !== password ? 'The two passwords do not match.' : '';
  const noToken = ready && !token && phase === 'form';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError('');
    setFormError('');
    if (password !== confirm) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) { setPhase('done'); return; }
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (res.status === 429) setFormError('Too many attempts. Wait a minute and try again.');
      else if (res.status === 400 && data?.error === 'invalid_or_expired') setPhase('expired');
      else if (res.status === 400 && data?.error === 'weak_password') setFieldError(PASSWORD_RULES);
      else setFormError('Something went wrong. Try again.');
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <AuthShell title="Choose a new password.">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Checking your link...</p>
      </AuthShell>
    );
  }

  if (phase === 'done') {
    return (
      <AuthShell title="Password updated." lead="You can sign in with your new password.">
        <div role="status" aria-live="polite" className="flex flex-col gap-5">
          <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden />
          <p className="text-base text-foreground">Your password has been changed.</p>
          <Link href="/login" className={cn(btnPrimary, 'w-full')}>Sign in</Link>
        </div>
      </AuthShell>
    );
  }

  if (phase === 'expired' || noToken) {
    return (
      <AuthShell title="This link has expired." lead="Reset links work for a short time and once only. Request a new one.">
        <div role="alert" className="flex flex-col gap-5">
          <TimerOff className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-base text-foreground">{noToken ? 'This page needs a reset link from your email.' : 'That reset link is no longer valid.'}</p>
          <Link href="/forgot-password" className={cn(btnPrimary, 'w-full')}>Request a new link</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password."
      lead="Pick something you do not use anywhere else."
      footer={<Link href="/login" className="text-primary hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" suppressHydrationWarning>
        <Field id="reset-password" label="New password" hint={PASSWORD_RULES} error={fieldError || undefined} extraDescribedBy="reset-strength">
          {({ id, describedBy, invalid }) => (
            <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" describedBy={describedBy} invalid={invalid} minLength={PASSWORD_MIN_LENGTH} />
          )}
        </Field>
        <StrengthHint id="reset-strength" password={password} />
        <Field id="reset-confirm" label="Confirm new password" error={mismatch || undefined}>
          {({ id, describedBy, invalid }) => (
            <PasswordInput id={id} value={confirm} onChange={setConfirm} autoComplete="new-password" describedBy={describedBy} invalid={invalid} minLength={PASSWORD_MIN_LENGTH} />
          )}
        </Field>
        <div id="reset-error" role="alert" aria-live="assertive" className={cn('text-sm text-destructive', !formError && 'hidden')}>{formError}</div>
        <SubmitButton busy={busy} busyLabel="Updating..." disabled={Boolean(mismatch)}>Update password</SubmitButton>
      </form>
    </AuthShell>
  );
}
