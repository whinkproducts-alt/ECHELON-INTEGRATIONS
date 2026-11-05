'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthShell, Field, PASSWORD_MIN_LENGTH, PASSWORD_RULES, PasswordInput, StatusNote, StrengthHint, SubmitButton, inputClass } from '@/components/screens/landing/ui';
import { URGENT_CHANNELS, URGENT_CHANNEL_LABELS, normalizePhone, type UrgentChannel } from '@/lib/phone';
import { cn } from '@/lib/utils';

const ALL_CHANNELS_ON: Record<UrgentChannel, boolean> = { call: true, sms: true, whatsapp: true };

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [urgentPhone, setUrgentPhone] = useState('');
  const [channels, setChannels] = useState<Record<UrgentChannel, boolean>>(ALL_CHANNELS_ON);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [needsToken, setNeedsToken] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let live = true;
    // If the status call fails the form still shows; the server decides on submit.
    fetch('/api/signup/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return;
        if (d.open === false) setClosed(true);
        if (d.needsBootstrapToken === true) setNeedsToken(true);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Urgent contact is optional, but a number that is present must be callable.
    const wantsUrgent = urgentPhone.trim() !== '';
    const urgentE164 = wantsUrgent ? normalizePhone(urgentPhone) : null;
    if (wantsUrgent && !urgentE164) {
      setError('Enter a phone number in international format, for example +1 555 123 4567.');
      return;
    }
    const chosenChannels = URGENT_CHANNELS.filter((c) => channels[c]);
    if (urgentE164 && chosenChannels.length === 0) {
      setError('Choose at least one way to reach you: call, SMS or WhatsApp.');
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = { email, password, name };
      if (needsToken) payload.bootstrapToken = bootstrapToken;
      if (urgentE164) {
        payload.urgentPhone = urgentE164;
        payload.urgentChannels = chosenChannels;
      }
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // 403 means signup is closed on this instance; the server sends a plain message, show it as is.
        const msg = typeof data?.error === 'string' && data.error ? data.error : null;
        setError(msg ?? (res.status === 403 ? 'Signups are closed on this instance.' : 'Signup failed'));
        return;
      }
      // Auto-login
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) {
        setError('Account created. Please sign in.');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      setError('Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account."
      lead="Set up in a minute. Anything that spends money or shares private information will still wait for you."
      footer={<>Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" suppressHydrationWarning>
        <Field id="signup-name" label="Name">
          {({ id, describedBy }) => (
            <input suppressHydrationWarning id={id} name="name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-describedby={describedBy} className={inputClass} placeholder="Your name" required />
          )}
        </Field>
        <Field id="signup-email" label="Email" extraDescribedBy={error ? 'signup-error' : undefined}>
          {({ id, describedBy }) => (
            <input suppressHydrationWarning id={id} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-describedby={describedBy} className={inputClass} placeholder="you@example.com" required />
          )}
        </Field>
        <Field id="signup-password" label="Password" hint={PASSWORD_RULES} extraDescribedBy="signup-strength">
          {({ id, describedBy }) => (
            <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="new-password" describedBy={describedBy} minLength={PASSWORD_MIN_LENGTH} disabled={closed} />
          )}
        </Field>
        <StrengthHint id="signup-strength" password={password} />
        <fieldset className="flex flex-col gap-3 border-t border-border pt-5">
          <legend className="sr-only">Urgent contact</legend>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-foreground">Urgent contact</p>
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Optional</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            WHINK, MAMBA and the Board can call, text or WhatsApp you when something cannot wait. The number is stored encrypted and only used for urgent issues.
          </p>
          <Field id="signup-phone" label="Phone" hint="International format, e.g. +1 555 123 4567.">
            {({ id, describedBy }) => (
              <input
                suppressHydrationWarning
                id={id}
                name="urgent-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={urgentPhone}
                onChange={(e) => setUrgentPhone(e.target.value)}
                aria-describedby={describedBy}
                className={inputClass}
                placeholder="+1 555 123 4567"
                disabled={closed}
              />
            )}
          </Field>
          <div role="group" aria-label="How may we reach you for urgent issues" className="flex flex-wrap gap-2">
            {URGENT_CHANNELS.map((channel) => {
              const on = channels[channel];
              return (
                <label
                  key={channel}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors',
                    on ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                    closed && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    disabled={closed}
                    onChange={() => setChannels((prev) => ({ ...prev, [channel]: !prev[channel] }))}
                  />
                  <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-primary' : 'bg-muted-foreground/50')} />
                  {URGENT_CHANNEL_LABELS[channel]}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Leave the phone empty and urgent issues stay in the dashboard.</p>
        </fieldset>
        {needsToken && (
          <Field id="signup-setup-token" label="Setup token" hint="The token set on the server as SIGNUP_BOOTSTRAP_TOKEN. Only the first account needs it.">
            {({ id, describedBy }) => (
              <input id={id} name="setup-token" suppressHydrationWarning type="password" autoComplete="off" value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} disabled={closed} aria-describedby={describedBy} className={inputClass} required />
            )}
          </Field>
        )}
        <StatusNote>{closed ? 'Signups are closed on this instance.' : undefined}</StatusNote>
        <div id="signup-error" role="alert" aria-live="assertive" className={cn('text-sm text-destructive', !error && 'hidden')}>{error}</div>
        <SubmitButton busy={loading} busyLabel="Creating account..." disabled={closed}>Create account</SubmitButton>
        <p className="text-xs text-muted-foreground">
          By creating an account you agree to the <Link href="/terms" className="text-primary hover:underline">Terms</Link> and <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
        </p>
      </form>
    </AuthShell>
  );
}
